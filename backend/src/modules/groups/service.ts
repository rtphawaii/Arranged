import type { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { DinnerGroup, Restaurant, User } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { ageAt, dateOnly } from '../../lib/time.js';
import type { groupDto, icebreakerDto, restaurantDto, tablemateDto } from '../dto.js';
import { describeVector } from '../personality/questions.js';
import { parseJsonArray, parseVector } from '../users/service.js';

export type GroupDto = z.infer<typeof groupDto>;

export const toRestaurantDto = (r: Restaurant): z.infer<typeof restaurantDto> => ({
  id: r.id,
  name: r.name,
  address: r.address,
  neighborhood: r.neighborhood,
  latitude: r.latitude,
  longitude: r.longitude,
  cuisine: r.cuisine,
  priceLevel: r.price_level,
  phone: r.phone,
  websiteUrl: r.website_url,
});

export class GroupService {
  constructor(private readonly ctx: AppContext) {}

  async getForMember(groupId: string, userId: string): Promise<DinnerGroup> {
    const group = await this.ctx.db.selectFrom('dinner_groups').selectAll().where('id', '=', groupId).executeTakeFirst();
    if (!group) throw errors.notFound('Dinner');
    const member = await this.ctx.db.selectFrom('group_members').select('user_id').where('group_id', '=', groupId).where('user_id', '=', userId).executeTakeFirst();
    if (!member) throw errors.notFound('Dinner');
    return group;
  }

  /** The member's next dinner table (revealed or still hidden), if any. */
  async upcomingForUser(userId: string): Promise<DinnerGroup | undefined> {
    return this.ctx.db
      .selectFrom('dinner_groups')
      .innerJoin('group_members', 'group_members.group_id', 'dinner_groups.id')
      .innerJoin('dinner_events', 'dinner_events.id', 'dinner_groups.event_id')
      .selectAll('dinner_groups')
      .where('group_members.user_id', '=', userId)
      .where('dinner_groups.status', 'in', ['draft', 'reserved', 'revealed'])
      .where('dinner_events.status', 'not in', ['cancelled', 'completed'])
      .orderBy('dinner_events.starts_at', 'asc')
      .executeTakeFirst();
  }

  async historyForUser(userId: string): Promise<DinnerGroup[]> {
    return this.ctx.db
      .selectFrom('dinner_groups')
      .innerJoin('group_members', 'group_members.group_id', 'dinner_groups.id')
      .innerJoin('dinner_events', 'dinner_events.id', 'dinner_groups.event_id')
      .selectAll('dinner_groups')
      .where('group_members.user_id', '=', userId)
      .where('dinner_groups.status', '=', 'completed')
      .orderBy('dinner_events.starts_at', 'desc')
      .limit(50)
      .execute();
  }

  async tablemates(groupId: string, viewerId: string): Promise<z.infer<typeof tablemateDto>[]> {
    const now = this.ctx.clock.now();
    const rows = await this.ctx.db
      .selectFrom('group_members')
      .innerJoin('users', 'users.id', 'group_members.user_id')
      .select(['users.id', 'users.first_name', 'users.birthdate', 'users.job_title', 'users.photo_url', 'users.languages', 'users.personality_vector', 'group_members.checked_in_at', 'group_members.seat_no'])
      .where('group_members.group_id', '=', groupId)
      .where('users.id', '!=', viewerId)
      .orderBy('group_members.seat_no')
      .execute();
    return rows.map((r) => {
      const vector = parseVector(r.personality_vector);
      return {
        userId: r.id,
        firstName: r.first_name ?? 'Guest',
        age: r.birthdate ? ageAt(dateOnly(r.birthdate)!, now) : null,
        jobTitle: r.job_title,
        photoUrl: r.photo_url,
        languages: parseJsonArray(r.languages),
        personalityLabels: vector ? describeVector(vector) : [],
        checkedIn: r.checked_in_at !== null,
      };
    });
  }

  async toDto(group: DinnerGroup, viewer: User): Promise<GroupDto> {
    const event = await this.ctx.db.selectFrom('dinner_events').selectAll().where('id', '=', group.event_id).executeTakeFirstOrThrow();
    const now = this.ctx.clock.now();
    const isRevealed = ['revealed', 'completed'].includes(group.status) || (group.status !== 'cancelled' && event.reveal_at <= now && event.status === 'revealed');

    const [restaurant, afterParty, me, feedback, conversation] = await Promise.all([
      isRevealed && group.restaurant_id ? this.ctx.db.selectFrom('restaurants').selectAll().where('id', '=', group.restaurant_id).executeTakeFirst() : undefined,
      isRevealed && group.after_party_venue_id ? this.ctx.db.selectFrom('after_party_venues').selectAll().where('id', '=', group.after_party_venue_id).executeTakeFirst() : undefined,
      this.ctx.db.selectFrom('group_members').select('checked_in_at').where('group_id', '=', group.id).where('user_id', '=', viewer.id).executeTakeFirst(),
      this.ctx.db.selectFrom('feedback').select('id').where('group_id', '=', group.id).where('user_id', '=', viewer.id).executeTakeFirst(),
      this.ctx.db.selectFrom('conversations').select('id').where('group_id', '=', group.id).executeTakeFirst(),
    ]);

    return {
      id: group.id,
      eventId: event.id,
      startsAt: event.starts_at.toISOString(),
      revealAt: event.reveal_at.toISOString(),
      status: group.status,
      isRevealed,
      tableLabel: group.table_label,
      reservationName: isRevealed ? group.reservation_name : null,
      restaurant: restaurant ? toRestaurantDto(restaurant) : null,
      tablemates: isRevealed ? await this.tablemates(group.id, viewer.id) : [],
      afterParty: afterParty
        ? { id: afterParty.id, name: afterParty.name, address: afterParty.address, startsAt: afterParty.starts_at.toISOString(), notes: afterParty.notes }
        : null,
      myCheckedInAt: me?.checked_in_at?.toISOString() ?? null,
      feedbackSubmitted: feedback !== undefined,
      conversationId: isRevealed ? (conversation?.id ?? null) : null,
    };
  }

  async checkIn(group: DinnerGroup, userId: string): Promise<void> {
    const event = await this.ctx.db.selectFrom('dinner_events').selectAll().where('id', '=', group.event_id).executeTakeFirstOrThrow();
    const now = this.ctx.clock.now();
    const windowStart = new Date(event.starts_at.getTime() - 90 * 60_000);
    const windowEnd = new Date(event.starts_at.getTime() + 4 * 60 * 60_000);
    if (now < windowStart || now > windowEnd) throw errors.conflict('Check-in opens 90 minutes before dinner');
    await this.ctx.db
      .updateTable('group_members')
      .set({ checked_in_at: now })
      .where('group_id', '=', group.id)
      .where('user_id', '=', userId)
      .where('checked_in_at', 'is', null)
      .execute();
  }

  async icebreakers(locale: string, limit = 12): Promise<z.infer<typeof icebreakerDto>[]> {
    let rows = await this.ctx.db.selectFrom('icebreakers').selectAll().where('is_active', '=', true).where('locale', '=', locale).execute();
    if (rows.length === 0 && locale !== 'en') {
      rows = await this.ctx.db.selectFrom('icebreakers').selectAll().where('is_active', '=', true).where('locale', '=', 'en').execute();
    }
    // Light questions first, then deeper ones; shuffle within intensity for variety.
    const shuffled = [...rows].sort((a, b) => a.intensity - b.intensity || Math.random() - 0.5);
    return shuffled.slice(0, limit).map((r) => ({ id: r.id, category: r.category, text: r.text, intensity: r.intensity }));
  }
}
