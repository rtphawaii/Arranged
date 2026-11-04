import type { AppContext } from '../../context.js';
import type { DinnerEvent, DinnerGroup } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { ageAt, dateOnly } from '../../lib/time.js';
import { parseJsonArray, parseVector } from '../users/service.js';
import { matchTables, pickRestaurant, type Candidate, type MatchOptions } from './algorithm.js';

export interface MatchingSummary {
  eventId: string;
  groups: Array<{ id: string; size: number; cost: number; restaurantId: string | null }>;
  waitlisted: string[];
  totalCost: number;
}

/** Loads candidates for an event, runs the algorithm, and persists tables (replacing any drafts). */
export class MatchingService {
  constructor(private readonly ctx: AppContext) {}

  async loadCandidates(event: DinnerEvent): Promise<Candidate[]> {
    const now = this.ctx.clock.now();
    const rows = await this.ctx.db
      .selectFrom('bookings')
      .innerJoin('users', 'users.id', 'bookings.user_id')
      .select([
        'bookings.id as booking_id',
        'bookings.preferences',
        'bookings.created_at as booked_at',
        'users.id as user_id',
        'users.birthdate',
        'users.gender',
        'users.languages',
        'users.personality_vector',
        'users.dietary',
      ])
      .where('bookings.event_id', '=', event.id)
      .where('bookings.status', '=', 'confirmed')
      .execute();
    if (rows.length === 0) return [];
    const userIds = rows.map((r) => r.user_id);

    // Previous tablemates: anyone who shared a (non-cancelled) table with each user.
    const history = await this.ctx.db
      .selectFrom('group_members as a')
      .innerJoin('group_members as b', 'a.group_id', 'b.group_id')
      .innerJoin('dinner_groups', 'dinner_groups.id', 'a.group_id')
      .select(['a.user_id as user_id', 'b.user_id as other_id'])
      .where('a.user_id', 'in', userIds)
      .where('dinner_groups.event_id', '!=', event.id)
      .where('dinner_groups.status', '!=', 'cancelled')
      .execute();
    const previous = new Map<string, Set<string>>();
    for (const h of history) {
      if (h.user_id === h.other_id) continue;
      if (!previous.has(h.user_id)) previous.set(h.user_id, new Set());
      previous.get(h.user_id)!.add(h.other_id);
    }

    const blocks = await this.ctx.db
      .selectFrom('user_blocks')
      .select(['blocker_id', 'blocked_id'])
      .where((eb) => eb.or([eb('blocker_id', 'in', userIds), eb('blocked_id', 'in', userIds)]))
      .execute();
    const blocked = new Map<string, Set<string>>();
    for (const b of blocks) {
      for (const [x, y] of [
        [b.blocker_id, b.blocked_id],
        [b.blocked_id, b.blocker_id],
      ] as const) {
        if (!blocked.has(x)) blocked.set(x, new Set());
        blocked.get(x)!.add(y);
      }
    }

    return rows.map((r) => {
      const prefs = typeof r.preferences === 'string' ? JSON.parse(r.preferences) : r.preferences;
      const userLangs = parseJsonArray(r.languages);
      return {
        userId: r.user_id,
        bookingId: r.booking_id,
        age: r.birthdate ? ageAt(dateOnly(r.birthdate)!, now) : 30,
        gender: r.gender ?? 'prefer_not_to_say',
        languages: (prefs.languages?.length ? prefs.languages : userLangs.length ? userLangs : ['en']) as string[],
        personality: parseVector(r.personality_vector),
        budget: prefs.budget ?? 'any',
        dietary: [...new Set([...(prefs.dietary ?? []), ...parseJsonArray(r.dietary)])],
        sameAgeGroup: Boolean(prefs.sameAgeGroup),
        previousTablemates: previous.get(r.user_id) ?? new Set(),
        blocked: blocked.get(r.user_id) ?? new Set(),
        bookedAt: r.booked_at,
      };
    });
  }

  async run(eventId: string, options: MatchOptions = {}): Promise<MatchingSummary> {
    const event = await this.ctx.db.selectFrom('dinner_events').selectAll().where('id', '=', eventId).executeTakeFirst();
    if (!event) throw errors.notFound('Event');
    if (!['booking_closed', 'matched'].includes(event.status)) {
      throw errors.conflict(`Cannot match an event in status ${event.status}`);
    }

    const candidates = await this.loadCandidates(event);
    const result = matchTables(candidates, options);

    const restaurants = await this.ctx.db
      .selectFrom('restaurants')
      .select(['id', 'price_level', 'max_tables'])
      .where('city_id', '=', event.city_id)
      .where('is_active', '=', true)
      .execute();
    const options_ = restaurants.map((r) => ({ id: r.id, priceLevel: r.price_level, remainingTables: r.max_tables }));

    const now = this.ctx.clock.now();
    const summary: MatchingSummary = { eventId: event.id, groups: [], waitlisted: [], totalCost: result.totalCost };

    await this.ctx.db.transaction().execute(async (trx) => {
      // Replace previous draft tables for this event.
      const drafts = await trx.selectFrom('dinner_groups').select('id').where('event_id', '=', event.id).where('status', '=', 'draft').execute();
      if (drafts.length > 0) {
        const ids = drafts.map((d) => d.id);
        await trx.deleteFrom('group_members').where('group_id', 'in', ids).execute();
        await trx.deleteFrom('dinner_groups').where('id', 'in', ids).execute();
      }

      let tableNo = 1;
      for (const table of result.tables) {
        const restaurant = pickRestaurant(table.members, options_);
        if (restaurant) restaurant.remainingTables -= 1;
        const group: DinnerGroup = {
          id: newId(),
          event_id: event.id,
          restaurant_id: restaurant?.id ?? null,
          table_label: `Table ${tableNo++}`,
          reservation_name: null,
          status: 'draft',
          match_score: table.cost,
          after_party_venue_id: null,
          created_at: now,
        };
        await trx.insertInto('dinner_groups').values(group).execute();
        await trx
          .insertInto('group_members')
          .values(table.members.map((m, i) => ({ group_id: group.id, user_id: m.userId, booking_id: m.bookingId, seat_no: i + 1, checked_in_at: null })))
          .execute();
        summary.groups.push({ id: group.id, size: table.members.length, cost: table.cost, restaurantId: group.restaurant_id });
      }

      for (const c of result.unassigned) {
        await trx.updateTable('bookings').set({ status: 'waitlisted', updated_at: now }).where('id', '=', c.bookingId).execute();
        summary.waitlisted.push(c.bookingId);
      }

      await trx.updateTable('dinner_events').set({ status: 'matched', updated_at: now }).where('id', '=', event.id).execute();
    });

    return summary;
  }
}
