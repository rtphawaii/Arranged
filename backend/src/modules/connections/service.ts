import type { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { Connection, User } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import type { connectionDto, feedbackBody } from '../dto.js';
import { GroupService } from '../groups/service.js';

export class ConnectionService {
  private readonly groups: GroupService;

  constructor(private readonly ctx: AppContext) {
    this.groups = new GroupService(ctx);
  }

  async submitFeedback(user: User, groupId: string, body: z.infer<typeof feedbackBody>): Promise<{ matched: string[] }> {
    const group = await this.groups.getForMember(groupId, user.id);
    if (!['revealed', 'completed'].includes(group.status)) throw errors.conflict('Feedback opens once the dinner has happened');
    const now = this.ctx.clock.now();
    await this.ctx.db
      .insertInto('feedback')
      .values({
        id: newId(),
        group_id: group.id,
        user_id: user.id,
        rating: body.rating,
        restaurant_rating: body.restaurantRating,
        comment: body.comment,
        attended: body.attended,
        created_at: now,
      })
      .onConflict((oc) =>
        oc.columns(['group_id', 'user_id']).doUpdateSet({
          rating: body.rating,
          restaurant_rating: body.restaurantRating,
          comment: body.comment,
          attended: body.attended,
        }),
      )
      .execute();
    if (!body.attended) {
      await this.ctx.db
        .updateTable('bookings')
        .set({ status: 'no_show', updated_at: now })
        .where('event_id', '=', group.event_id)
        .where('user_id', '=', user.id)
        .where('status', 'in', ['confirmed', 'attended'])
        .execute();
    }
    const matched: string[] = [];
    for (const targetId of body.connectWith) {
      const result = await this.requestConnection(user, group.id, targetId);
      if (result.matched) matched.push(targetId);
    }
    return { matched };
  }

  /**
   * Opt-in, double-blind: a request is invisible to the other person until they also ask.
   * When both sides request, a connection + direct conversation is created.
   */
  async requestConnection(user: User, groupId: string, targetId: string): Promise<{ requested: boolean; matched: boolean; connection: Connection | null }> {
    if (targetId === user.id) throw errors.badRequest('Cannot connect with yourself');
    const group = await this.groups.getForMember(groupId, user.id);
    const target = await this.ctx.db.selectFrom('group_members').select('user_id').where('group_id', '=', group.id).where('user_id', '=', targetId).executeTakeFirst();
    if (!target) throw errors.unprocessable('That person was not at your table');

    const now = this.ctx.clock.now();
    await this.ctx.db
      .insertInto('connection_requests')
      .values({ id: newId(), group_id: group.id, from_user_id: user.id, to_user_id: targetId, created_at: now })
      .onConflict((oc) => oc.doNothing())
      .execute();

    const existing = await this.findConnection(user.id, targetId);
    if (existing) return { requested: true, matched: true, connection: existing };

    const reciprocal = await this.ctx.db
      .selectFrom('connection_requests')
      .select('id')
      .where('group_id', '=', group.id)
      .where('from_user_id', '=', targetId)
      .where('to_user_id', '=', user.id)
      .executeTakeFirst();
    if (!reciprocal) return { requested: true, matched: false, connection: null };

    const [a, b] = [user.id, targetId].sort() as [string, string];
    const connection = await this.ctx.db.transaction().execute(async (trx) => {
      const convId = newId();
      await trx.insertInto('conversations').values({ id: convId, kind: 'direct', group_id: group.id, created_at: now }).execute();
      await trx
        .insertInto('conversation_members')
        .values([
          { conversation_id: convId, user_id: a, last_read_at: null, joined_at: now },
          { conversation_id: convId, user_id: b, last_read_at: null, joined_at: now },
        ])
        .execute();
      return trx
        .insertInto('connections')
        .values({ id: newId(), user_a_id: a, user_b_id: b, group_id: group.id, conversation_id: convId, created_at: now })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    await this.ctx.notifications.notifyMany([user.id, targetId], 'new_connection', 'It is mutual!', 'You both wanted to stay in touch. Say hi.', {
      connectionId: connection.id,
      conversationId: connection.conversation_id,
    });
    return { requested: true, matched: true, connection };
  }

  async findConnection(userId: string, otherId: string): Promise<Connection | undefined> {
    const [a, b] = [userId, otherId].sort() as [string, string];
    return this.ctx.db.selectFrom('connections').selectAll().where('user_a_id', '=', a).where('user_b_id', '=', b).executeTakeFirst();
  }

  async listForUser(userId: string): Promise<Connection[]> {
    return this.ctx.db
      .selectFrom('connections')
      .selectAll()
      .where((eb) => eb.or([eb('user_a_id', '=', userId), eb('user_b_id', '=', userId)]))
      .orderBy('created_at', 'desc')
      .execute();
  }

  async toDto(c: Connection, viewerId: string): Promise<z.infer<typeof connectionDto>> {
    const otherId = c.user_a_id === viewerId ? c.user_b_id : c.user_a_id;
    const mates = await this.groups.tablemates(c.group_id, viewerId);
    const other = mates.find((m) => m.userId === otherId);
    const fallback = await this.ctx.db.selectFrom('users').select(['id', 'first_name', 'photo_url', 'job_title', 'languages']).where('id', '=', otherId).executeTakeFirstOrThrow();
    return {
      id: c.id,
      user: other ?? {
        userId: fallback.id,
        firstName: fallback.first_name ?? 'Guest',
        age: null,
        jobTitle: fallback.job_title,
        photoUrl: fallback.photo_url,
        languages: [],
        personalityLabels: [],
        checkedIn: false,
      },
      groupId: c.group_id,
      conversationId: c.conversation_id,
      createdAt: c.created_at.toISOString(),
    };
  }

  async remove(userId: string, connectionId: string): Promise<void> {
    const c = await this.ctx.db.selectFrom('connections').selectAll().where('id', '=', connectionId).executeTakeFirst();
    if (!c || (c.user_a_id !== userId && c.user_b_id !== userId)) throw errors.notFound('Connection');
    await this.ctx.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('connections').where('id', '=', c.id).execute();
      await trx.deleteFrom('conversations').where('id', '=', c.conversation_id).execute();
    });
  }
}
