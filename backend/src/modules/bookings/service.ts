import type { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { Booking, BookingPreferences, DinnerEvent, User } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import type { bookingPreferencesSchema } from '../dto.js';
import { EventService } from '../events/service.js';
import { UserService } from '../users/service.js';

export class BookingService {
  private readonly events: EventService;
  private readonly users: UserService;

  constructor(private readonly ctx: AppContext) {
    this.events = new EventService(ctx);
    this.users = new UserService(ctx);
  }

  async getOwned(bookingId: string, userId: string): Promise<Booking> {
    const booking = await this.ctx.db.selectFrom('bookings').selectAll().where('id', '=', bookingId).executeTakeFirst();
    if (!booking || booking.user_id !== userId) throw errors.notFound('Booking');
    return booking;
  }

  async listMine(userId: string): Promise<Booking[]> {
    return this.ctx.db.selectFrom('bookings').selectAll().where('user_id', '=', userId).orderBy('created_at', 'desc').limit(50).execute();
  }

  /**
   * Reserves a seat. Members with an active membership are confirmed immediately; everyone else
   * gets a `pending_payment` booking plus a payment intent the app completes with the provider.
   */
  async create(
    user: User,
    eventId: string,
    preferences: z.infer<typeof bookingPreferencesSchema>,
  ): Promise<{ booking: Booking; requiresPayment: boolean }> {
    if (user.status !== 'active') throw errors.forbidden('Finish onboarding before booking a dinner');
    const event = await this.events.getEvent(eventId);
    const now = this.ctx.clock.now();
    this.assertBookable(event, now);

    const existing = await this.events.myBooking(event.id, user.id);
    if (existing) throw errors.conflict('You already have a booking for this dinner');

    const membership = await this.users.activeMembership(user.id);
    const confirmedCount = await this.events.confirmedCount(event.id);
    const full = event.capacity !== null && confirmedCount >= event.capacity;
    const prefs: BookingPreferences = {
      budget: preferences.budget,
      dietary: preferences.dietary,
      languages: preferences.languages.length > 0 ? preferences.languages : parseLangs(user.languages),
      sameAgeGroup: preferences.sameAgeGroup,
    };

    const bookingId = newId();
    if (full) {
      const booking = await this.ctx.db
        .insertInto('bookings')
        .values({ id: bookingId, user_id: user.id, event_id: event.id, status: 'waitlisted', preferences: JSON.stringify(prefs), payment_id: null, cancelled_at: null, created_at: now, updated_at: now })
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.ctx.notifications.notify(user.id, 'booking_waitlisted', 'You are on the waitlist', 'We will let you know if a seat opens up.', { bookingId });
      return { booking, requiresPayment: false };
    }

    if (membership || event.price_cents === 0) {
      const booking = await this.ctx.db
        .insertInto('bookings')
        .values({ id: bookingId, user_id: user.id, event_id: event.id, status: 'confirmed', preferences: JSON.stringify(prefs), payment_id: null, cancelled_at: null, created_at: now, updated_at: now })
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.notifyConfirmed(user.id, event, bookingId);
      return { booking, requiresPayment: false };
    }

    const intent = await this.ctx.payments.createPaymentIntent({
      amountCents: event.price_cents,
      currency: event.currency,
      userId: user.id,
      description: `Arranged dinner seat ${event.starts_at.toISOString().slice(0, 10)}`,
      metadata: { bookingId, eventId: event.id },
    });

    const booking = await this.ctx.db.transaction().execute(async (trx) => {
      const paymentId = newId();
      await trx
        .insertInto('payments')
        .values({
          id: paymentId,
          user_id: user.id,
          booking_id: bookingId,
          kind: 'seat',
          provider: this.ctx.payments.name,
          provider_ref: intent.providerRef,
          client_secret: intent.clientSecret,
          amount_cents: event.price_cents,
          currency: event.currency,
          status: 'requires_payment',
          failure_reason: null,
          created_at: now,
          updated_at: now,
        })
        .execute();
      return trx
        .insertInto('bookings')
        .values({ id: bookingId, user_id: user.id, event_id: event.id, status: 'pending_payment', preferences: JSON.stringify(prefs), payment_id: paymentId, cancelled_at: null, created_at: now, updated_at: now })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    return { booking, requiresPayment: true };
  }

  /** Called by the app after completing payment, and by the webhook. Idempotent. */
  async confirmPayment(bookingId: string): Promise<Booking> {
    const booking = await this.ctx.db.selectFrom('bookings').selectAll().where('id', '=', bookingId).executeTakeFirst();
    if (!booking) throw errors.notFound('Booking');
    if (booking.status === 'confirmed') return booking;
    if (booking.status !== 'pending_payment' || !booking.payment_id) throw errors.conflict(`Booking is ${booking.status}`);
    const payment = await this.ctx.db.selectFrom('payments').selectAll().where('id', '=', booking.payment_id).executeTakeFirstOrThrow();
    const status = payment.provider_ref ? await this.ctx.payments.getPaymentStatus(payment.provider_ref) : 'failed';
    const now = this.ctx.clock.now();
    if (status !== 'succeeded') {
      await this.ctx.db.updateTable('payments').set({ status: status === 'processing' ? 'processing' : payment.status, updated_at: now }).where('id', '=', payment.id).execute();
      throw errors.paymentRequired(`Payment has not succeeded yet (status: ${status})`);
    }
    const event = await this.events.getEvent(booking.event_id);
    const confirmed = await this.ctx.db.transaction().execute(async (trx) => {
      await trx.updateTable('payments').set({ status: 'succeeded', updated_at: now }).where('id', '=', payment.id).execute();
      return trx
        .updateTable('bookings')
        .set({ status: 'confirmed', updated_at: now })
        .where('id', '=', booking.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    await this.notifyConfirmed(booking.user_id, event, booking.id);
    return confirmed;
  }

  /**
   * Cancellation policy: free (refunded) until bookings close. After that the seat is forfeited,
   * since the restaurant has already been booked around the table size.
   */
  async cancel(user: User, bookingId: string): Promise<Booking> {
    const booking = await this.getOwned(bookingId, user.id);
    if (!['pending_payment', 'confirmed', 'waitlisted'].includes(booking.status)) {
      throw errors.conflict(`Booking is already ${booking.status}`);
    }
    const event = await this.events.getEvent(booking.event_id);
    const now = this.ctx.clock.now();
    if (event.starts_at <= now) throw errors.conflict('This dinner has already started');
    const refundable = now < event.booking_closes_at && booking.status === 'confirmed' && booking.payment_id !== null;

    if (now >= event.booking_closes_at && booking.status === 'confirmed') {
      // Late cancellation: remove from any drafted table so the host can re-run matching.
      await this.ctx.db.deleteFrom('group_members').where('booking_id', '=', booking.id).execute();
    }

    let finalStatus: Booking['status'] = 'cancelled';
    if (booking.payment_id) {
      const payment = await this.ctx.db.selectFrom('payments').selectAll().where('id', '=', booking.payment_id).executeTakeFirstOrThrow();
      if (payment.status === 'requires_payment' && payment.provider_ref) {
        await this.ctx.payments.cancel(payment.provider_ref).catch(() => undefined);
        await this.ctx.db.updateTable('payments').set({ status: 'cancelled', updated_at: now }).where('id', '=', payment.id).execute();
      } else if (refundable && payment.status === 'succeeded' && payment.provider_ref) {
        await this.ctx.payments.refund(payment.provider_ref);
        await this.ctx.db.updateTable('payments').set({ status: 'refunded', updated_at: now }).where('id', '=', payment.id).execute();
        finalStatus = 'refunded';
      }
    }

    const updated = await this.ctx.db
      .updateTable('bookings')
      .set({ status: finalStatus, cancelled_at: now, updated_at: now })
      .where('id', '=', booking.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await this.promoteWaitlist(event);
    await this.ctx.notifications.notify(user.id, 'booking_cancelled', 'Booking cancelled', refundable ? 'Your seat was refunded.' : 'Your seat has been released.', { bookingId });
    return updated;
  }

  /** Moves the earliest waitlisted booking into `pending_payment` (or confirmed for members) when a seat frees up. */
  async promoteWaitlist(event: DinnerEvent): Promise<void> {
    if (event.capacity === null) return;
    const now = this.ctx.clock.now();
    if (now >= event.booking_closes_at) return;
    const confirmed = await this.events.confirmedCount(event.id);
    if (confirmed >= event.capacity) return;
    const next = await this.ctx.db
      .selectFrom('bookings')
      .selectAll()
      .where('event_id', '=', event.id)
      .where('status', '=', 'waitlisted')
      .orderBy('created_at', 'asc')
      .executeTakeFirst();
    if (!next) return;
    const user = await this.ctx.db.selectFrom('users').selectAll().where('id', '=', next.user_id).executeTakeFirstOrThrow();
    // Re-run the normal flow by cancelling the waitlist row and creating a fresh booking.
    await this.ctx.db.updateTable('bookings').set({ status: 'cancelled', cancelled_at: now, updated_at: now }).where('id', '=', next.id).execute();
    const prefs = typeof next.preferences === 'string' ? JSON.parse(next.preferences) : next.preferences;
    await this.create(user, event.id, prefs);
  }

  private assertBookable(event: DinnerEvent, now: Date) {
    if (event.status === 'cancelled') throw errors.gone('This dinner was cancelled');
    if (now < event.booking_opens_at) throw errors.conflict('Bookings are not open yet');
    if (now >= event.booking_closes_at || !['scheduled', 'booking_open'].includes(event.status)) {
      throw errors.conflict('Bookings for this dinner are closed');
    }
  }

  private async notifyConfirmed(userId: string, event: DinnerEvent, bookingId: string) {
    await this.ctx.notifications.notify(
      userId,
      'booking_confirmed',
      'Your seat is booked',
      `See you on ${event.starts_at.toISOString().slice(0, 10)}. We'll reveal your table the day before.`,
      { bookingId, eventId: event.id },
    );
  }
}

function parseLangs(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  try {
    const parsed = JSON.parse(String(v));
    return Array.isArray(parsed) ? parsed : ['en'];
  } catch {
    return ['en'];
  }
}
