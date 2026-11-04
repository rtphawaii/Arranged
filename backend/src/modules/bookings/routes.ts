import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { bookingDto, createBookingBody, createBookingResponse } from '../dto.js';
import { EventService } from '../events/service.js';
import { BookingService } from './service.js';

export const bookingRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const bookings = new BookingService(ctx);
  const events = new EventService(ctx);

  app.post(
    '/events/:eventId/bookings',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['bookings'], params: z.object({ eventId: z.string().uuid() }), body: createBookingBody, response: { 201: createBookingResponse } },
    },
    async (req, reply) => {
      const { booking, requiresPayment } = await bookings.create(req.user, req.params.eventId, req.body.preferences);
      return reply.code(201).send({ booking: await events.toBookingDto(booking), requiresPayment });
    },
  );

  app.get('/bookings', { preHandler: [app.authenticate], schema: { tags: ['bookings'], response: { 200: z.array(bookingDto) } } }, async (req) => {
    const rows = await bookings.listMine(req.user.id);
    return Promise.all(rows.map((b) => events.toBookingDto(b)));
  });

  app.get(
    '/bookings/:bookingId',
    { preHandler: [app.authenticate], schema: { tags: ['bookings'], params: z.object({ bookingId: z.string().uuid() }), response: { 200: bookingDto } } },
    async (req) => events.toBookingDto(await bookings.getOwned(req.params.bookingId, req.user.id)),
  );

  app.post(
    '/bookings/:bookingId/confirm',
    { preHandler: [app.authenticate], schema: { tags: ['bookings'], params: z.object({ bookingId: z.string().uuid() }), response: { 200: bookingDto } } },
    async (req) => {
      await bookings.getOwned(req.params.bookingId, req.user.id);
      return events.toBookingDto(await bookings.confirmPayment(req.params.bookingId));
    },
  );

  app.delete(
    '/bookings/:bookingId',
    { preHandler: [app.authenticate], schema: { tags: ['bookings'], params: z.object({ bookingId: z.string().uuid() }), response: { 200: bookingDto } } },
    async (req) => events.toBookingDto(await bookings.cancel(req.user, req.params.bookingId)),
  );
};
