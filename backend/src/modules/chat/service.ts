import type { z } from 'zod';
import type { AppContext } from '../../context.js';
import type { Conversation, Message } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import type { conversationDto, messageDto } from '../dto.js';

export const toMessageDto = (m: Message): z.infer<typeof messageDto> => ({
  id: m.id,
  conversationId: m.conversation_id,
  senderId: m.sender_id,
  body: m.body,
  createdAt: m.created_at.toISOString(),
});

export class ChatService {
  constructor(private readonly ctx: AppContext) {}

  async getForMember(conversationId: string, userId: string): Promise<Conversation> {
    const row = await this.ctx.db
      .selectFrom('conversations')
      .innerJoin('conversation_members', 'conversation_members.conversation_id', 'conversations.id')
      .selectAll('conversations')
      .where('conversations.id', '=', conversationId)
      .where('conversation_members.user_id', '=', userId)
      .executeTakeFirst();
    if (!row) throw errors.notFound('Conversation');
    return row;
  }

  async listForUser(userId: string): Promise<z.infer<typeof conversationDto>[]> {
    const convs = await this.ctx.db
      .selectFrom('conversations')
      .innerJoin('conversation_members', 'conversation_members.conversation_id', 'conversations.id')
      .select(['conversations.id', 'conversations.kind', 'conversations.group_id', 'conversations.created_at', 'conversation_members.last_read_at'])
      .where('conversation_members.user_id', '=', userId)
      .execute();
    const result = await Promise.all(convs.map((c) => this.summarise(c, userId)));
    return result.sort((a, b) => (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? ''));
  }

  private async summarise(
    c: { id: string; kind: Conversation['kind']; group_id: string | null; last_read_at: Date | null },
    viewerId: string,
  ): Promise<z.infer<typeof conversationDto>> {
    const participants = await this.ctx.db
      .selectFrom('conversation_members')
      .innerJoin('users', 'users.id', 'conversation_members.user_id')
      .select(['users.id', 'users.first_name', 'users.photo_url'])
      .where('conversation_members.conversation_id', '=', c.id)
      .where('users.id', '!=', viewerId)
      .execute();
    const last = await this.ctx.db.selectFrom('messages').selectAll().where('conversation_id', '=', c.id).orderBy('created_at', 'desc').executeTakeFirst();
    let unreadQuery = this.ctx.db
      .selectFrom('messages')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .where('conversation_id', '=', c.id)
      .where('sender_id', '!=', viewerId);
    if (c.last_read_at) unreadQuery = unreadQuery.where('created_at', '>', c.last_read_at);
    const unread = await unreadQuery.executeTakeFirstOrThrow();
    const names = participants.map((p) => p.first_name ?? 'Guest');
    let title = names.join(', ');
    if (c.kind === 'group' && c.group_id) {
      const g = await this.ctx.db.selectFrom('dinner_groups').select('table_label').where('id', '=', c.group_id).executeTakeFirst();
      title = `${g?.table_label ?? 'Your table'} · ${names.join(', ')}`;
    }
    return {
      id: c.id,
      kind: c.kind,
      groupId: c.group_id,
      title,
      participants: participants.map((p) => ({ userId: p.id, firstName: p.first_name ?? 'Guest', photoUrl: p.photo_url })),
      lastMessage: last ? toMessageDto(last) : null,
      unreadCount: Number(unread.count),
    };
  }

  async messages(conversationId: string, opts: { after?: string; before?: string; limit: number }): Promise<Message[]> {
    let q = this.ctx.db.selectFrom('messages').selectAll().where('conversation_id', '=', conversationId);
    if (opts.after) {
      const anchor = await this.ctx.db.selectFrom('messages').select('created_at').where('id', '=', opts.after).executeTakeFirst();
      if (anchor) q = q.where('created_at', '>', anchor.created_at);
      return q.orderBy('created_at', 'asc').limit(opts.limit).execute();
    }
    if (opts.before) {
      const anchor = await this.ctx.db.selectFrom('messages').select('created_at').where('id', '=', opts.before).executeTakeFirst();
      if (anchor) q = q.where('created_at', '<', anchor.created_at);
    }
    const rows = await q.orderBy('created_at', 'desc').limit(opts.limit).execute();
    return rows.reverse();
  }

  async send(conversationId: string, senderId: string, body: string): Promise<Message> {
    const now = this.ctx.clock.now();
    const message = await this.ctx.db
      .insertInto('messages')
      .values({ id: newId(), conversation_id: conversationId, sender_id: senderId, body: body.trim(), created_at: now })
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.ctx.db
      .updateTable('conversation_members')
      .set({ last_read_at: now })
      .where('conversation_id', '=', conversationId)
      .where('user_id', '=', senderId)
      .execute();
    const sender = await this.ctx.db.selectFrom('users').select('first_name').where('id', '=', senderId).executeTakeFirstOrThrow();
    const others = await this.ctx.db.selectFrom('conversation_members').select('user_id').where('conversation_id', '=', conversationId).where('user_id', '!=', senderId).execute();
    await this.ctx.notifications.notifyMany(
      others.map((o) => o.user_id),
      'new_message',
      sender.first_name ?? 'New message',
      body.length > 120 ? `${body.slice(0, 117)}...` : body,
      { conversationId },
    );
    return message;
  }

  async markRead(conversationId: string, userId: string): Promise<void> {
    await this.ctx.db
      .updateTable('conversation_members')
      .set({ last_read_at: this.ctx.clock.now() })
      .where('conversation_id', '=', conversationId)
      .where('user_id', '=', userId)
      .execute();
  }
}
