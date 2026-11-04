import type { AppContext } from '../../context.js';
import type { DinnerEvent } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { addHours } from '../../lib/time.js';
import { MatchingService } from '../matching/service.js';
import { EVENT_DEFAULTS } from './service.js';

/**
 * State machine for a dinner event:
 *   scheduled -> booking_open -> booking_closed -> matched -> revealed -> completed
 *   any (before completed) -> cancelled
 * Transitions are triggered by the scheduler (time-based) or by an admin.
 */
export class EventLifecycle {
  private readonly matching: MatchingService;

  constructor(private readonly ctx: AppContext) {
    this.matching = new MatchingService(ctx);
  }

  private async get(eventId: string): Promise<DinnerEvent> {
    const e = await this.ctx.db.selectFrom('dinner_events').selectAll().where('id', '=', eventId).executeTakeFirst();
    if (!e) throw errors.notFound('Event');
    return e;
  }

  private async setStatus(eventId: string, status: DinnerEvent['status']): Promise<DinnerEvent> {
    return this.ctx.db
      .updateTable('dinner_events')
      .set({ status, updated_at: this.ctx.clock.now() })
      .where('id', '=', eventId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async openBooking(eventId: string): Promise<DinnerEvent> {
    const e = await this.get(eventId);
    if (e.status !== 'scheduled') throw errors.conflict(`Cannot open bookings from ${e.status}`);
    return this.setStatus(e.id, 'booking_open');
  }

  async closeBooking(eventId: string): Promise<DinnerEvent> {
    const e = await this.get(eventId);
    if (!['scheduled', 'booking_open'].includes(e.status)) throw errors.conflict(`Cannot close bookings from ${e.status}`);
    const now = this.ctx.clock.now();
    // Abandoned pending payments lose their seat.
    await this.ctx.db
      .updateTable('bookings')
      .set({ status: 'cancelled', cancelled_at: now, updated_at: now })
      .where('event_id', '=', e.id)
      .where('status', '=', 'pending_payment')
      .execute();
    return this.setStatus(e.id, 'booking_closed');
  }

  async match(eventId: string, seed?: number) {
    return this.matching.run(eventId, seed === undefined ? {} : { seed });
  }

  /** Publishes tables to members and sends the reveal notification. */
  async reveal(eventId: string): Promise<DinnerEvent> {
    const e = await this.get(eventId);
    if (e.status !== 'matched') throw errors.conflict(`Cannot reveal from ${e.status}`);
    const now = this.ctx.clock.now();
    const groups = await this.ctx.db
      .selectFrom('dinner_groups')
      .selectAll()
      .where('event_id', '=', e.id)
      .where('status', 'in', ['draft', 'reserved'])
      .execute();
    await this.ctx.db.transaction().execute(async (trx) => {
      for (const g of groups) {
        await trx.updateTable('dinner_groups').set({ status: 'revealed' }).where('id', '=', g.id).execute();
        // Group chat so the table can coordinate.
        const existing = await trx.selectFrom('conversations').select('id').where('group_id', '=', g.id).executeTakeFirst();
        if (!existing) {
          const convId = newId();
          await trx.insertInto('conversations').values({ id: convId, kind: 'group', group_id: g.id, created_at: now }).execute();
          const members = await trx.selectFrom('group_members').select('user_id').where('group_id', '=', g.id).execute();
          if (members.length > 0) {
            await trx
              .insertInto('conversation_members')
              .values(members.map((m) => ({ conversation_id: convId, user_id: m.user_id, last_read_at: null, joined_at: now })))
              .execute();
          }
        }
      }
    });
    const memberIds = await this.ctx.db
      .selectFrom('group_members')
      .select('user_id')
      .where('group_id', 'in', groups.map((g) => g.id).concat(['00000000-0000-0000-0000-000000000000']))
      .execute();
    await this.ctx.notifications.notifyMany(
      memberIds.map((m) => m.user_id),
      'group_revealed',
      'Your table is ready',
      'Tap to see where you are having dinner and who is joining you.',
      { eventId: e.id },
    );
    return this.setStatus(e.id, 'revealed');
  }

  async complete(eventId: string): Promise<DinnerEvent> {
    const e = await this.get(eventId);
    if (e.status !== 'revealed') throw errors.conflict(`Cannot complete from ${e.status}`);
    const now = this.ctx.clock.now();
    const groups = await this.ctx.db.selectFrom('dinner_groups').select('id').where('event_id', '=', e.id).where('status', '=', 'revealed').execute();
    const groupIds = groups.map((g) => g.id);
    if (groupIds.length > 0) {
      await this.ctx.db.updateTable('dinner_groups').set({ status: 'completed' }).where('id', 'in', groupIds).execute();
      const members = await this.ctx.db.selectFrom('group_members').select(['user_id', 'booking_id', 'checked_in_at']).where('group_id', 'in', groupIds).execute();
      for (const m of members) {
        await this.ctx.db
          .updateTable('bookings')
          .set({ status: 'attended', updated_at: now })
          .where('id', '=', m.booking_id)
          .where('status', '=', 'confirmed')
          .execute();
      }
      await this.ctx.notifications.notifyMany(
        members.map((m) => m.user_id),
        'feedback_request',
        'How was dinner?',
        'Rate your evening and choose who you would like to stay in touch with.',
        { eventId: e.id },
      );
    }
    return this.setStatus(e.id, 'completed');
  }

  async cancel(eventId: string, reason = 'This dinner was cancelled'): Promise<DinnerEvent> {
    const e = await this.get(eventId);
    if (['completed', 'cancelled'].includes(e.status)) throw errors.conflict(`Cannot cancel from ${e.status}`);
    const now = this.ctx.clock.now();
    const live = await this.ctx.db
      .selectFrom('bookings')
      .selectAll()
      .where('event_id', '=', e.id)
      .where('status', 'in', ['pending_payment', 'confirmed', 'waitlisted'])
      .execute();
    for (const b of live) {
      let status: 'cancelled' | 'refunded' = 'cancelled';
      if (b.payment_id) {
        const p = await this.ctx.db.selectFrom('payments').selectAll().where('id', '=', b.payment_id).executeTakeFirstOrThrow();
        if (p.status === 'succeeded' && p.provider_ref) {
          await this.ctx.payments.refund(p.provider_ref).catch((err) => this.ctx.log.error({ err }, 'refund failed'));
          await this.ctx.db.updateTable('payments').set({ status: 'refunded', updated_at: now }).where('id', '=', p.id).execute();
          status = 'refunded';
        } else if (p.status === 'requires_payment' && p.provider_ref) {
          await this.ctx.payments.cancel(p.provider_ref).catch(() => undefined);
          await this.ctx.db.updateTable('payments').set({ status: 'cancelled', updated_at: now }).where('id', '=', p.id).execute();
        }
      }
      await this.ctx.db.updateTable('bookings').set({ status, cancelled_at: now, updated_at: now }).where('id', '=', b.id).execute();
    }
    await this.ctx.db.updateTable('dinner_groups').set({ status: 'cancelled' }).where('event_id', '=', e.id).execute();
    await this.ctx.notifications.notifyMany(live.map((b) => b.user_id), 'event_cancelled', 'Dinner cancelled', reason, { eventId: e.id });
    return this.setStatus(e.id, 'cancelled');
  }

  /** Time-based transitions. Returns what happened so the scheduler can log it. */
  async tick(now = this.ctx.clock.now()): Promise<string[]> {
    const actions: string[] = [];
    const events = await this.ctx.db
      .selectFrom('dinner_events')
      .selectAll()
      .where('status', 'not in', ['completed', 'cancelled'])
      .where('starts_at', '>', addHours(now, -48))
      .execute();

    for (const e of events) {
      try {
        if (e.status === 'scheduled' && e.booking_opens_at <= now && e.booking_closes_at > now) {
          await this.openBooking(e.id);
          actions.push(`open:${e.id}`);
        }
        if (['scheduled', 'booking_open'].includes(e.status) && e.booking_closes_at <= now) {
          await this.closeBooking(e.id);
          const summary = await this.match(e.id);
          actions.push(`close+match:${e.id}(${summary.groups.length} tables)`);
          e.status = 'matched';
        }
        if (e.status === 'matched' && e.reveal_at <= now) {
          await this.reveal(e.id);
          actions.push(`reveal:${e.id}`);
          e.status = 'revealed';
        }
        if (e.status === 'revealed' && addHours(e.starts_at, EVENT_DEFAULTS.completeHoursAfter) <= now) {
          await this.complete(e.id);
          actions.push(`complete:${e.id}`);
        }
      } catch (err) {
        this.ctx.log.error({ err, eventId: e.id }, 'lifecycle tick failed for event');
      }
    }
    return actions;
  }
}
