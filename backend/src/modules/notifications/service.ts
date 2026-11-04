import type { Db } from '../../db/client.js';
import { newId } from '../../lib/ids.js';
import type { Clock } from '../../lib/time.js';
import type { PushProvider } from './push.js';

export type NotificationType =
  | 'booking_confirmed'
  | 'booking_waitlisted'
  | 'booking_cancelled'
  | 'group_revealed'
  | 'dinner_reminder'
  | 'dinner_today'
  | 'feedback_request'
  | 'new_connection'
  | 'new_message'
  | 'event_cancelled';

export class NotificationService {
  constructor(
    private readonly db: Db,
    private readonly push: PushProvider,
    private readonly clock: Clock,
  ) {}

  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    await this.notifyMany([userId], type, title, body, data);
  }

  async notifyMany(
    userIds: string[],
    type: NotificationType,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    if (userIds.length === 0) return;
    const now = this.clock.now();
    await this.db
      .insertInto('notifications')
      .values(
        userIds.map((userId) => ({
          id: newId(),
          user_id: userId,
          type,
          title,
          body,
          data: JSON.stringify({ type, ...data }),
          sent_at: now,
          read_at: null,
          created_at: now,
        })),
      )
      .execute();

    const tokens = await this.db
      .selectFrom('device_tokens')
      .select(['token', 'environment'])
      .where('user_id', 'in', userIds)
      .execute();
    if (tokens.length === 0) return;
    const { invalidTokens } = await this.push.send(
      tokens.map((t) => ({ token: t.token, environment: t.environment })),
      { title, body, data: { type, ...data } },
    );
    if (invalidTokens.length > 0) {
      await this.db.deleteFrom('device_tokens').where('token', 'in', invalidTokens).execute();
    }
  }
}
