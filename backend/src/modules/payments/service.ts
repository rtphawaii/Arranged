import type { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { Subscription, User } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { BookingService } from '../bookings/service.js';
import type { membershipDto } from '../dto.js';
import type { WebhookEvent } from './provider.js';

export const MEMBERSHIP_PLAN = 'monthly';

export class PaymentService {
  private readonly bookings: BookingService;

  constructor(private readonly ctx: AppContext) {
    this.bookings = new BookingService(ctx);
  }

  async handleWebhook(rawBody: string | Buffer, signature: string | undefined): Promise<void> {
    const event = await this.ctx.payments.parseWebhook(rawBody, signature);
    if (!event) return;
    if (event.status) await this.applyPaymentUpdate(event);
    if (event.subscriptionStatus) await this.applySubscriptionUpdate(event);
  }

  private async applyPaymentUpdate(event: WebhookEvent) {
    const payment = await this.ctx.db.selectFrom('payments').selectAll().where('provider_ref', '=', event.providerRef).executeTakeFirst();
    if (!payment) {
      this.ctx.log.warn({ providerRef: event.providerRef }, 'webhook for unknown payment');
      return;
    }
    const now = this.ctx.clock.now();
    if (event.status === 'succeeded' && payment.booking_id) {
      await this.bookings.confirmPayment(payment.booking_id).catch((err) => this.ctx.log.error({ err }, 'confirmPayment from webhook failed'));
      return;
    }
    if (event.status === 'failed' || event.status === 'cancelled') {
      await this.ctx.db
        .updateTable('payments')
        .set({ status: event.status, failure_reason: event.type, updated_at: now })
        .where('id', '=', payment.id)
        .execute();
      if (payment.booking_id) {
        await this.ctx.db
          .updateTable('bookings')
          .set({ status: 'cancelled', cancelled_at: now, updated_at: now })
          .where('id', '=', payment.booking_id)
          .where('status', '=', 'pending_payment')
          .execute();
      }
    }
  }

  private async applySubscriptionUpdate(event: WebhookEvent) {
    const now = this.ctx.clock.now();
    const status: Subscription['status'] =
      event.subscriptionStatus === 'active' ? 'active' : event.subscriptionStatus === 'past_due' ? 'past_due' : 'cancelled';
    await this.ctx.db
      .updateTable('subscriptions')
      .set({ status, ...(event.currentPeriodEnd && { current_period_end: event.currentPeriodEnd }), updated_at: now })
      .where('provider_ref', '=', event.providerRef)
      .execute();
  }

  async myMembership(userId: string): Promise<Subscription | undefined> {
    return this.ctx.db
      .selectFrom('subscriptions')
      .selectAll()
      .where('user_id', '=', userId)
      .where('status', 'in', ['active', 'past_due'])
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
  }

  async subscribe(user: User): Promise<{ subscription: Subscription; clientSecret: string | null }> {
    const existing = await this.myMembership(user.id);
    if (existing?.status === 'active') throw errors.conflict('You already have an active membership');
    const ref = await this.ctx.payments.createSubscription(user.id, MEMBERSHIP_PLAN, user.email);
    const now = this.ctx.clock.now();
    const subscription = await this.ctx.db
      .insertInto('subscriptions')
      .values({
        id: newId(),
        user_id: user.id,
        provider: this.ctx.payments.name,
        provider_ref: ref.providerRef,
        plan: MEMBERSHIP_PLAN,
        status: ref.status === 'active' ? 'active' : ref.status === 'past_due' ? 'past_due' : 'cancelled',
        current_period_end: ref.currentPeriodEnd,
        cancel_at_period_end: false,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    // Stripe subscriptions start "incomplete" until the first invoice is paid; mark active via webhook.
    if (ref.status === 'incomplete') {
      await this.ctx.db.updateTable('subscriptions').set({ status: 'expired' }).where('id', '=', subscription.id).execute();
    }
    return { subscription, clientSecret: ref.clientSecret };
  }

  async cancelMembership(user: User): Promise<Subscription> {
    const existing = await this.myMembership(user.id);
    if (!existing) throw errors.notFound('Membership');
    if (existing.provider_ref) await this.ctx.payments.cancelSubscription(existing.provider_ref, true);
    return this.ctx.db
      .updateTable('subscriptions')
      .set({ cancel_at_period_end: true, updated_at: this.ctx.clock.now() })
      .where('id', '=', existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  toMembershipDto(s: Subscription, clientSecret: string | null = null): z.infer<typeof membershipDto> {
    return {
      id: s.id,
      plan: s.plan,
      status: s.status,
      currentPeriodEnd: s.current_period_end.toISOString(),
      cancelAtPeriodEnd: s.cancel_at_period_end,
      clientSecret,
    };
  }
}
