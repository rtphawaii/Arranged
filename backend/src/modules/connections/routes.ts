import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { connectResponse, connectionDto, feedbackBody, okResponse } from '../dto.js';
import { ConnectionService } from './service.js';

export const connectionRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const connections = new ConnectionService(ctx);

  app.post(
    '/dinners/:groupId/feedback',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['connections'], params: z.object({ groupId: z.string().uuid() }), body: feedbackBody, response: { 200: z.object({ matched: z.array(z.string()) }) } },
    },
    async (req) => connections.submitFeedback(req.user, req.params.groupId, req.body),
  );

  app.post(
    '/dinners/:groupId/connect',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['connections'],
        params: z.object({ groupId: z.string().uuid() }),
        body: z.object({ userId: z.string().uuid() }),
        response: { 200: connectResponse },
      },
    },
    async (req) => {
      const r = await connections.requestConnection(req.user, req.params.groupId, req.body.userId);
      return { requested: r.requested, matched: r.matched, connection: r.connection ? await connections.toDto(r.connection, req.user.id) : null };
    },
  );

  app.get('/connections', { preHandler: [app.authenticate], schema: { tags: ['connections'], response: { 200: z.array(connectionDto) } } }, async (req) => {
    const rows = await connections.listForUser(req.user.id);
    return Promise.all(rows.map((c) => connections.toDto(c, req.user.id)));
  });

  app.delete(
    '/connections/:connectionId',
    { preHandler: [app.authenticate], schema: { tags: ['connections'], params: z.object({ connectionId: z.string().uuid() }), response: { 200: okResponse } } },
    async (req) => {
      await connections.remove(req.user.id, req.params.connectionId);
      return { ok: true as const };
    },
  );
};
