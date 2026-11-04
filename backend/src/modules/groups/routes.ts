import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { groupDto, icebreakerDto, okResponse } from '../dto.js';
import { GroupService } from './service.js';

const params = z.object({ groupId: z.string().uuid() });

export const groupRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const groups = new GroupService(ctx);

  app.get('/dinners/upcoming', { preHandler: [app.authenticate], schema: { tags: ['dinners'], response: { 200: groupDto.nullable() } } }, async (req) => {
    const g = await groups.upcomingForUser(req.user.id);
    return g ? groups.toDto(g, req.user) : null;
  });

  app.get('/dinners/history', { preHandler: [app.authenticate], schema: { tags: ['dinners'], response: { 200: z.array(groupDto) } } }, async (req) => {
    const rows = await groups.historyForUser(req.user.id);
    return Promise.all(rows.map((g) => groups.toDto(g, req.user)));
  });

  app.get('/dinners/:groupId', { preHandler: [app.authenticate], schema: { tags: ['dinners'], params, response: { 200: groupDto } } }, async (req) =>
    groups.toDto(await groups.getForMember(req.params.groupId, req.user.id), req.user),
  );

  app.post('/dinners/:groupId/checkin', { preHandler: [app.authenticate], schema: { tags: ['dinners'], params, response: { 200: groupDto } } }, async (req) => {
    const g = await groups.getForMember(req.params.groupId, req.user.id);
    await groups.checkIn(g, req.user.id);
    return groups.toDto(g, req.user);
  });

  app.get(
    '/dinners/:groupId/icebreakers',
    { preHandler: [app.authenticate], schema: { tags: ['dinners'], params, response: { 200: z.array(icebreakerDto) } } },
    async (req) => {
      await groups.getForMember(req.params.groupId, req.user.id);
      return groups.icebreakers(req.user.locale);
    },
  );

  app.get('/health', { schema: { tags: ['meta'], response: { 200: okResponse.extend({ time: z.string() }) } } }, async () => ({
    ok: true as const,
    time: ctx.clock.now().toISOString(),
  }));
};
