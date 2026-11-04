import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { notificationDto, okResponse } from '../dto.js';

export const notificationRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  app.get('/notifications', { preHandler: [app.authenticate], schema: { tags: ['notifications'], response: { 200: z.array(notificationDto) } } }, async (req) => {
    const rows = await ctx.db.selectFrom('notifications').selectAll().where('user_id', '=', req.user.id).orderBy('created_at', 'desc').limit(50).execute();
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: (typeof n.data === 'string' ? JSON.parse(n.data) : n.data) as Record<string, unknown>,
      readAt: n.read_at?.toISOString() ?? null,
      createdAt: n.created_at.toISOString(),
    }));
  });

  app.post('/notifications/read', { preHandler: [app.authenticate], schema: { tags: ['notifications'], response: { 200: okResponse } } }, async (req) => {
    await ctx.db.updateTable('notifications').set({ read_at: ctx.clock.now() }).where('user_id', '=', req.user.id).where('read_at', 'is', null).execute();
    return { ok: true as const };
  });
};
