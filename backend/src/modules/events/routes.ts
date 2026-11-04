import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { errors } from '../../lib/errors.js';
import { eventDto } from '../dto.js';
import { EventService } from './service.js';

export const eventRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const events = new EventService(ctx);

  app.get(
    '/events',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['events'],
        querystring: z.object({ cityId: z.string().uuid().optional() }),
        response: { 200: z.array(eventDto) },
      },
    },
    async (req) => {
      const cityId = req.query.cityId ?? req.user.city_id;
      if (!cityId) throw errors.badRequest('Pick a city first');
      const rows = await events.listUpcoming(cityId);
      return Promise.all(rows.map((e) => events.toEventDto(e, req.user.id)));
    },
  );

  app.get(
    '/events/:eventId',
    { preHandler: [app.authenticate], schema: { tags: ['events'], params: z.object({ eventId: z.string().uuid() }), response: { 200: eventDto } } },
    async (req) => events.toEventDto(await events.getEvent(req.params.eventId), req.user.id),
  );
};
