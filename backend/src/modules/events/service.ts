import type { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { Booking, City, DinnerEvent, Payment } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { addDays, addHours, addMinutes, nextWeekdayAt } from '../../lib/time.js';
import type { bookingDto, eventDto, paymentDto } from '../dto.js';

export type EventDto = z.infer<typeof eventDto>;
export type BookingDto = z.infer<typeof bookingDto>;

/** Default lifecycle offsets relative to the dinner start. */
export const EVENT_DEFAULTS = {
  bookingOpensDaysBefore: 14,
  bookingClosesHoursBefore: 30, // the day before, in the afternoon
  revealHoursBefore: 24,
  completeHoursAfter: 4,
};

export const toPaymentDto = (p: Payment): z.infer<typeof paymentDto> => ({
  id: p.id,
  provider: p.provider,
  status: p.status,
  amountCents: p.amount_cents,
  currency: p.currency,
  clientSecret: p.status === 'requires_payment' ? p.client_secret : null,
});

export class EventService {
  constructor(private readonly ctx: AppContext) {}

  async getEvent(eventId: string): Promise<DinnerEvent> {
    const event = await this.ctx.db.selectFrom('dinner_events').selectAll().where('id', '=', eventId).executeTakeFirst();
    if (!event) throw errors.notFound('Event');
    return event;
  }

  /** Upcoming events for a city (bookable or soon-to-be), oldest first. */
  async listUpcoming(cityId: string, limit = 6): Promise<DinnerEvent[]> {
    return this.ctx.db
      .selectFrom('dinner_events')
      .selectAll()
      .where('city_id', '=', cityId)
      .where('starts_at', '>', this.ctx.clock.now())
      .where('status', 'not in', ['cancelled'])
      .orderBy('starts_at', 'asc')
      .limit(limit)
      .execute();
  }

  async confirmedCount(eventId: string): Promise<number> {
    const row = await this.ctx.db
      .selectFrom('bookings')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .where('event_id', '=', eventId)
      .where('status', 'in', ['confirmed', 'pending_payment'])
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async myBooking(eventId: string, userId: string): Promise<Booking | undefined> {
    return this.ctx.db
      .selectFrom('bookings')
      .selectAll()
      .where('event_id', '=', eventId)
      .where('user_id', '=', userId)
      .where('status', 'in', ['pending_payment', 'confirmed', 'waitlisted', 'attended'])
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
  }

  async toBookingDto(b: Booking): Promise<BookingDto> {
    const payment = b.payment_id
      ? await this.ctx.db.selectFrom('payments').selectAll().where('id', '=', b.payment_id).executeTakeFirst()
      : undefined;
    const member = await this.ctx.db.selectFrom('group_members').select('group_id').where('booking_id', '=', b.id).executeTakeFirst();
    const prefs = typeof b.preferences === 'string' ? JSON.parse(b.preferences) : b.preferences;
    return {
      id: b.id,
      eventId: b.event_id,
      status: b.status,
      preferences: { budget: 'any', dietary: [], languages: [], sameAgeGroup: false, ...prefs },
      payment: payment ? toPaymentDto(payment) : null,
      groupId: member?.group_id ?? null,
      createdAt: b.created_at.toISOString(),
    };
  }

  async toEventDto(e: DinnerEvent, userId: string | null): Promise<EventDto> {
    const booking = userId ? await this.myBooking(e.id, userId) : undefined;
    const spotsLeft = e.capacity === null ? null : Math.max(0, e.capacity - (await this.confirmedCount(e.id)));
    return {
      id: e.id,
      cityId: e.city_id,
      startsAt: e.starts_at.toISOString(),
      bookingOpensAt: e.booking_opens_at.toISOString(),
      bookingClosesAt: e.booking_closes_at.toISOString(),
      revealAt: e.reveal_at.toISOString(),
      status: e.status,
      priceCents: e.price_cents,
      currency: e.currency,
      spotsLeft,
      myBooking: booking ? await this.toBookingDto(booking) : null,
    };
  }

  async create(input: {
    cityId: string;
    startsAt: Date;
    bookingOpensAt?: Date;
    bookingClosesAt?: Date;
    revealAt?: Date;
    priceCents?: number;
    capacity?: number | null;
  }): Promise<DinnerEvent> {
    const city = await this.ctx.db.selectFrom('cities').selectAll().where('id', '=', input.cityId).executeTakeFirst();
    if (!city) throw errors.notFound('City');
    const now = this.ctx.clock.now();
    const bookingOpensAt = input.bookingOpensAt ?? addDays(input.startsAt, -EVENT_DEFAULTS.bookingOpensDaysBefore);
    const bookingClosesAt = input.bookingClosesAt ?? addHours(input.startsAt, -EVENT_DEFAULTS.bookingClosesHoursBefore);
    const revealAt = input.revealAt ?? addHours(input.startsAt, -EVENT_DEFAULTS.revealHoursBefore);
    if (!(bookingOpensAt < bookingClosesAt && bookingClosesAt <= revealAt && revealAt < input.startsAt)) {
      throw errors.unprocessable('Timeline must satisfy opens < closes <= reveal < start');
    }
    return this.ctx.db
      .insertInto('dinner_events')
      .values({
        id: newId(),
        city_id: city.id,
        starts_at: input.startsAt,
        booking_opens_at: bookingOpensAt,
        booking_closes_at: bookingClosesAt,
        reveal_at: revealAt,
        status: bookingOpensAt <= now ? 'booking_open' : 'scheduled',
        price_cents: input.priceCents ?? city.default_price_cents,
        currency: city.currency,
        capacity: input.capacity ?? null,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Ensures every active city has a weekly dinner scheduled for the next `weeksAhead` weeks. */
  async generateWeekly(weeksAhead: number, cityId?: string): Promise<DinnerEvent[]> {
    let query = this.ctx.db.selectFrom('cities').selectAll().where('is_active', '=', true);
    if (cityId) query = query.where('id', '=', cityId);
    const cities = await query.execute();
    const created: DinnerEvent[] = [];
    const now = this.ctx.clock.now();
    for (const city of cities) {
      let cursor = now;
      for (let i = 0; i < weeksAhead; i++) {
        const startsAt = nextWeekdayAt(cursor, city.dinner_weekday, city.dinner_hour, city.dinner_minute, city.timezone);
        cursor = addMinutes(startsAt, 1);
        const exists = await this.ctx.db
          .selectFrom('dinner_events')
          .select('id')
          .where('city_id', '=', city.id)
          .where('starts_at', '>=', addHours(startsAt, -12))
          .where('starts_at', '<=', addHours(startsAt, 12))
          .executeTakeFirst();
        if (exists) continue;
        // Guard: don't create an event whose booking window would already be closed.
        if (addHours(startsAt, -EVENT_DEFAULTS.bookingClosesHoursBefore) <= now) continue;
        created.push(await this.create({ cityId: city.id, startsAt }));
      }
    }
    return created;
  }

  async cityFor(event: DinnerEvent): Promise<City> {
    return this.ctx.db.selectFrom('cities').selectAll().where('id', '=', event.city_id).executeTakeFirstOrThrow();
  }
}
