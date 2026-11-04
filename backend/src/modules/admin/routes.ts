import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { errors } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { toCityDto } from '../cities/routes.js';
import {
  adminAfterPartyBody,
  adminCityBody,
  adminEventBody,
  adminGenerateEventsBody,
  adminGroupUpdateBody,
  adminIcebreakerBody,
  adminRestaurantBody,
  afterPartyDto,
  cityDto,
  eventDto,
  icebreakerDto,
  okResponse,
  restaurantDto,
} from '../dto.js';
import { EventLifecycle } from '../events/lifecycle.js';
import { EventService } from '../events/service.js';
import { toRestaurantDto } from '../groups/service.js';

const adminGroupDto = z.object({
  id: z.string(),
  eventId: z.string(),
  tableLabel: z.string(),
  status: z.string(),
  matchScore: z.number().nullable(),
  restaurantId: z.string().nullable(),
  reservationName: z.string().nullable(),
  afterPartyVenueId: z.string().nullable(),
  members: z.array(
    z.object({ userId: z.string(), firstName: z.string().nullable(), phone: z.string(), seatNo: z.number(), checkedIn: z.boolean() }),
  ),
});

const matchSummaryDto = z.object({
  eventId: z.string(),
  groups: z.array(z.object({ id: z.string(), size: z.number(), cost: z.number(), restaurantId: z.string().nullable() })),
  waitlisted: z.array(z.string()),
  totalCost: z.number(),
});

/** Back-office endpoints. Protected by `requireAdmin` (admin user JWT or ADMIN_API_TOKEN). */
export const adminRoutes = (ctx: AppContext): FastifyPluginAsyncZod => async (app) => {
  const events = new EventService(ctx);
  const lifecycle = new EventLifecycle(ctx);
  app.addHook('preHandler', app.requireAdmin);

  // --- Cities ---
  app.get('/admin/cities', { schema: { tags: ['admin'], response: { 200: z.array(cityDto) } } }, async () =>
    (await ctx.db.selectFrom('cities').selectAll().orderBy('name').execute()).map(toCityDto),
  );
  app.post('/admin/cities', { schema: { tags: ['admin'], body: adminCityBody, response: { 201: cityDto } } }, async (req, reply) => {
    const b = req.body;
    const city = await ctx.db
      .insertInto('cities')
      .values({
        id: newId(),
        slug: b.slug,
        name: b.name,
        country_code: b.countryCode.toUpperCase(),
        timezone: b.timezone,
        currency: b.currency.toUpperCase(),
        default_price_cents: b.defaultPriceCents,
        dinner_weekday: b.dinnerWeekday,
        dinner_hour: b.dinnerHour,
        dinner_minute: b.dinnerMinute,
        is_active: b.isActive,
        created_at: ctx.clock.now(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return reply.code(201).send(toCityDto(city));
  });

  // --- Restaurants ---
  app.get(
    '/admin/restaurants',
    { schema: { tags: ['admin'], querystring: z.object({ cityId: z.string().uuid().optional() }), response: { 200: z.array(restaurantDto) } } },
    async (req) => {
      let q = ctx.db.selectFrom('restaurants').selectAll().orderBy('name');
      if (req.query.cityId) q = q.where('city_id', '=', req.query.cityId);
      return (await q.execute()).map(toRestaurantDto);
    },
  );
  app.post('/admin/restaurants', { schema: { tags: ['admin'], body: adminRestaurantBody, response: { 201: restaurantDto } } }, async (req, reply) => {
    const b = req.body;
    const r = await ctx.db
      .insertInto('restaurants')
      .values({
        id: newId(),
        city_id: b.cityId,
        name: b.name,
        address: b.address,
        neighborhood: b.neighborhood,
        latitude: b.latitude,
        longitude: b.longitude,
        cuisine: b.cuisine,
        price_level: b.priceLevel,
        max_tables: b.maxTables,
        booking_notes: b.bookingNotes,
        phone: b.phone,
        website_url: b.websiteUrl,
        is_active: b.isActive,
        created_at: ctx.clock.now(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return reply.code(201).send(toRestaurantDto(r));
  });
  app.patch(
    '/admin/restaurants/:restaurantId',
    { schema: { tags: ['admin'], params: z.object({ restaurantId: z.string().uuid() }), body: adminRestaurantBody.partial(), response: { 200: restaurantDto } } },
    async (req) => {
      const b = req.body;
      const r = await ctx.db
        .updateTable('restaurants')
        .set({
          ...(b.name !== undefined && { name: b.name }),
          ...(b.address !== undefined && { address: b.address }),
          ...(b.neighborhood !== undefined && { neighborhood: b.neighborhood }),
          ...(b.latitude !== undefined && { latitude: b.latitude }),
          ...(b.longitude !== undefined && { longitude: b.longitude }),
          ...(b.cuisine !== undefined && { cuisine: b.cuisine }),
          ...(b.priceLevel !== undefined && { price_level: b.priceLevel }),
          ...(b.maxTables !== undefined && { max_tables: b.maxTables }),
          ...(b.bookingNotes !== undefined && { booking_notes: b.bookingNotes }),
          ...(b.phone !== undefined && { phone: b.phone }),
          ...(b.websiteUrl !== undefined && { website_url: b.websiteUrl }),
          ...(b.isActive !== undefined && { is_active: b.isActive }),
        })
        .where('id', '=', req.params.restaurantId)
        .returningAll()
        .executeTakeFirst();
      if (!r) throw errors.notFound('Restaurant');
      return toRestaurantDto(r);
    },
  );

  // --- Events ---
  app.get(
    '/admin/events',
    { schema: { tags: ['admin'], querystring: z.object({ cityId: z.string().uuid().optional(), includePast: z.coerce.boolean().default(false) }), response: { 200: z.array(eventDto) } } },
    async (req) => {
      let q = ctx.db.selectFrom('dinner_events').selectAll().orderBy('starts_at', 'desc').limit(100);
      if (req.query.cityId) q = q.where('city_id', '=', req.query.cityId);
      if (!req.query.includePast) q = q.where('starts_at', '>', ctx.clock.now());
      return Promise.all((await q.execute()).map((e) => events.toEventDto(e, null)));
    },
  );
  app.post('/admin/events', { schema: { tags: ['admin'], body: adminEventBody, response: { 201: eventDto } } }, async (req, reply) => {
    const b = req.body;
    const e = await events.create({
      cityId: b.cityId,
      startsAt: new Date(b.startsAt),
      bookingOpensAt: b.bookingOpensAt ? new Date(b.bookingOpensAt) : undefined,
      bookingClosesAt: b.bookingClosesAt ? new Date(b.bookingClosesAt) : undefined,
      revealAt: b.revealAt ? new Date(b.revealAt) : undefined,
      priceCents: b.priceCents,
      capacity: b.capacity,
    });
    return reply.code(201).send(await events.toEventDto(e, null));
  });
  app.post('/admin/events/generate', { schema: { tags: ['admin'], body: adminGenerateEventsBody, response: { 201: z.array(eventDto) } } }, async (req, reply) => {
    const created = await events.generateWeekly(req.body.weeksAhead);
    return reply.code(201).send(await Promise.all(created.map((e) => events.toEventDto(e, null))));
  });

  const eventParams = z.object({ eventId: z.string().uuid() });
  app.post('/admin/events/:eventId/open', { schema: { tags: ['admin'], params: eventParams, response: { 200: eventDto } } }, async (req) =>
    events.toEventDto(await lifecycle.openBooking(req.params.eventId), null),
  );
  app.post('/admin/events/:eventId/close', { schema: { tags: ['admin'], params: eventParams, response: { 200: eventDto } } }, async (req) =>
    events.toEventDto(await lifecycle.closeBooking(req.params.eventId), null),
  );
  app.post(
    '/admin/events/:eventId/match',
    { schema: { tags: ['admin'], params: eventParams, body: z.object({ seed: z.number().int().optional() }).default({}), response: { 200: matchSummaryDto } } },
    async (req) => lifecycle.match(req.params.eventId, req.body.seed),
  );
  app.post('/admin/events/:eventId/reveal', { schema: { tags: ['admin'], params: eventParams, response: { 200: eventDto } } }, async (req) =>
    events.toEventDto(await lifecycle.reveal(req.params.eventId), null),
  );
  app.post('/admin/events/:eventId/complete', { schema: { tags: ['admin'], params: eventParams, response: { 200: eventDto } } }, async (req) =>
    events.toEventDto(await lifecycle.complete(req.params.eventId), null),
  );
  app.post(
    '/admin/events/:eventId/cancel',
    { schema: { tags: ['admin'], params: eventParams, body: z.object({ reason: z.string().optional() }).default({}), response: { 200: eventDto } } },
    async (req) => events.toEventDto(await lifecycle.cancel(req.params.eventId, req.body.reason), null),
  );

  // --- Groups ---
  app.get('/admin/events/:eventId/groups', { schema: { tags: ['admin'], params: eventParams, response: { 200: z.array(adminGroupDto) } } }, async (req) => {
    const groups = await ctx.db.selectFrom('dinner_groups').selectAll().where('event_id', '=', req.params.eventId).orderBy('table_label').execute();
    return Promise.all(
      groups.map(async (g) => {
        const members = await ctx.db
          .selectFrom('group_members')
          .innerJoin('users', 'users.id', 'group_members.user_id')
          .select(['users.id', 'users.first_name', 'users.phone', 'group_members.seat_no', 'group_members.checked_in_at'])
          .where('group_members.group_id', '=', g.id)
          .orderBy('group_members.seat_no')
          .execute();
        return {
          id: g.id,
          eventId: g.event_id,
          tableLabel: g.table_label,
          status: g.status,
          matchScore: g.match_score,
          restaurantId: g.restaurant_id,
          reservationName: g.reservation_name,
          afterPartyVenueId: g.after_party_venue_id,
          members: members.map((m) => ({ userId: m.id, firstName: m.first_name, phone: m.phone, seatNo: m.seat_no, checkedIn: m.checked_in_at !== null })),
        };
      }),
    );
  });
  app.patch(
    '/admin/groups/:groupId',
    { schema: { tags: ['admin'], params: z.object({ groupId: z.string().uuid() }), body: adminGroupUpdateBody, response: { 200: okResponse } } },
    async (req) => {
      const b = req.body;
      const res = await ctx.db
        .updateTable('dinner_groups')
        .set({
          ...(b.restaurantId !== undefined && { restaurant_id: b.restaurantId }),
          ...(b.reservationName !== undefined && { reservation_name: b.reservationName }),
          ...(b.afterPartyVenueId !== undefined && { after_party_venue_id: b.afterPartyVenueId }),
          ...(b.restaurantId && { status: 'reserved' as const }),
        })
        .where('id', '=', req.params.groupId)
        .where('status', 'in', ['draft', 'reserved', 'revealed'])
        .executeTakeFirst();
      if (Number(res.numUpdatedRows) === 0) throw errors.notFound('Group');
      return { ok: true as const };
    },
  );

  // --- After-party venues ---
  app.post(
    '/admin/events/:eventId/after-party',
    { schema: { tags: ['admin'], params: eventParams, body: adminAfterPartyBody, response: { 201: afterPartyDto } } },
    async (req, reply) => {
      await events.getEvent(req.params.eventId);
      const v = await ctx.db
        .insertInto('after_party_venues')
        .values({ id: newId(), event_id: req.params.eventId, name: req.body.name, address: req.body.address, starts_at: new Date(req.body.startsAt), notes: req.body.notes })
        .returningAll()
        .executeTakeFirstOrThrow();
      // Attach to every table of the event by default.
      await ctx.db.updateTable('dinner_groups').set({ after_party_venue_id: v.id }).where('event_id', '=', req.params.eventId).where('after_party_venue_id', 'is', null).execute();
      return reply.code(201).send({ id: v.id, name: v.name, address: v.address, startsAt: v.starts_at.toISOString(), notes: v.notes });
    },
  );

  // --- Icebreakers ---
  app.post('/admin/icebreakers', { schema: { tags: ['admin'], body: adminIcebreakerBody, response: { 201: icebreakerDto } } }, async (req, reply) => {
    const r = await ctx.db
      .insertInto('icebreakers')
      .values({ locale: req.body.locale, category: req.body.category, text: req.body.text, intensity: req.body.intensity, is_active: true })
      .returningAll()
      .executeTakeFirstOrThrow();
    return reply.code(201).send({ id: r.id, category: r.category, text: r.text, intensity: r.intensity });
  });

  // --- Users ---
  app.post(
    '/admin/users/:userId/role',
    { schema: { tags: ['admin'], params: z.object({ userId: z.string().uuid() }), body: z.object({ role: z.enum(['member', 'admin']) }), response: { 200: okResponse } } },
    async (req) => {
      await ctx.db.updateTable('users').set({ role: req.body.role, updated_at: ctx.clock.now() }).where('id', '=', req.params.userId).execute();
      return { ok: true as const };
    },
  );
  app.post(
    '/admin/users/:userId/suspend',
    { schema: { tags: ['admin'], params: z.object({ userId: z.string().uuid() }), body: z.object({ suspended: z.boolean() }), response: { 200: okResponse } } },
    async (req) => {
      await ctx.db
        .updateTable('users')
        .set({ status: req.body.suspended ? 'suspended' : 'active', updated_at: ctx.clock.now() })
        .where('id', '=', req.params.userId)
        .execute();
      if (req.body.suspended) await ctx.auth.revokeAll(req.params.userId);
      return { ok: true as const };
    },
  );

  // --- Scheduler ---
  app.post('/admin/jobs/tick', { schema: { tags: ['admin'], response: { 200: z.object({ actions: z.array(z.string()) }) } } }, async () => ({
    actions: await lifecycle.tick(),
  }));
};
