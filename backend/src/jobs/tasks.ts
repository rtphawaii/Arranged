import type { AppContext } from '../context.js';
import { addHours } from '../lib/time.js';
import { EventLifecycle } from '../modules/events/lifecycle.js';
import { EventService } from '../modules/events/service.js';

/**
 * Background work. Every task is idempotent so it can run from the in-process scheduler or an
 * external cron (`npm run jobs -- <task>`), and can safely be retried.
 */
export class Jobs {
  private readonly lifecycle: EventLifecycle;
  private readonly events: EventService;

  constructor(private readonly ctx: AppContext) {
    this.lifecycle = new EventLifecycle(ctx);
    this.events = new EventService(ctx);
  }

  /** Advances event states (open/close+match/reveal/complete) based on the clock. */
  async lifecycleTick(): Promise<string[]> {
    return this.lifecycle.tick();
  }

  /** Keeps a rolling 4-week calendar of dinners per active city. */
  async ensureUpcomingEvents(weeksAhead = 4): Promise<number> {
    const created = await this.events.generateWeekly(weeksAhead);
    return created.length;
  }

  /** "Dinner tomorrow / tonight" reminders. Sent once per window thanks to the notifications log. */
  async sendReminders(): Promise<number> {
    const now = this.ctx.clock.now();
    let sent = 0;
    const windows = [
      { type: 'dinner_reminder' as const, from: addHours(now, 20), to: addHours(now, 26), title: 'Dinner is tomorrow', body: 'Your table is waiting. Check the details and plan your trip.' },
      { type: 'dinner_today' as const, from: addHours(now, 2), to: addHours(now, 4), title: 'Dinner is in a few hours', body: 'Check in when you arrive so your table knows you are there.' },
    ];
    for (const w of windows) {
      const members = await this.ctx.db
        .selectFrom('group_members')
        .innerJoin('dinner_groups', 'dinner_groups.id', 'group_members.group_id')
        .innerJoin('dinner_events', 'dinner_events.id', 'dinner_groups.event_id')
        .select(['group_members.user_id', 'dinner_events.id as event_id'])
        .where('dinner_groups.status', '=', 'revealed')
        .where('dinner_events.starts_at', '>=', w.from)
        .where('dinner_events.starts_at', '<', w.to)
        .execute();
      for (const m of members) {
        const already = await this.ctx.db
          .selectFrom('notifications')
          .select('id')
          .where('user_id', '=', m.user_id)
          .where('type', '=', w.type)
          .where('created_at', '>', addHours(now, -48))
          .executeTakeFirst();
        if (already) continue;
        await this.ctx.notifications.notify(m.user_id, w.type, w.title, w.body, { eventId: m.event_id });
        sent++;
      }
    }
    return sent;
  }

  /** Removes expired OTP codes and refresh tokens. */
  async cleanup(): Promise<void> {
    const now = this.ctx.clock.now();
    await this.ctx.db.deleteFrom('otp_codes').where('expires_at', '<', addHours(now, -24)).execute();
    await this.ctx.db.deleteFrom('refresh_tokens').where('expires_at', '<', now).execute();
  }

  async runAll(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    result.events = await this.ensureUpcomingEvents();
    result.lifecycle = await this.lifecycleTick();
    result.reminders = await this.sendReminders();
    await this.cleanup();
    return result;
  }
}
