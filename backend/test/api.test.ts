import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, addHours } from '../src/lib/time.js';
import { EventLifecycle } from '../src/modules/events/lifecycle.js';
import { admin, bookAndPay, call, createCity, createEvent, createRestaurant, createTestEnv, signUpUser, type TestEnv, type TestUser } from './helpers.js';

describe('API end-to-end', () => {
  let env: TestEnv;
  let cityId: string;

  beforeAll(async () => {
    env = await createTestEnv();
    const city = await createCity(env);
    cityId = city.id;
    await createRestaurant(env, cityId, 'Cheap Eats', 1, 2);
    await createRestaurant(env, cityId, 'Mid Bistro', 2, 2);
    await createRestaurant(env, cityId, 'Fancy Place', 4, 1);
  });

  afterAll(async () => {
    await env.close();
  });

  describe('auth & onboarding', () => {
    it('rejects bad phone numbers and wrong codes', async () => {
      const bad = await env.app.inject({ method: 'POST', url: '/v1/auth/otp/request', payload: { phone: '12345' } });
      expect(bad.statusCode).toBe(400);
      await call(env, 'POST', '/auth/otp/request', { body: { phone: '+14155550100' }, expect: 200 });
      const wrong = await env.app.inject({ method: 'POST', url: '/v1/auth/otp/verify', payload: { phone: '+14155550100', code: '123456' } });
      expect(wrong.statusCode).toBe(401);
    });

    it('creates a user on first verification, then refreshes and rotates tokens', async () => {
      const first = await call(env, 'POST', '/auth/otp/verify', { body: { phone: '+14155550100', code: '000000' }, expect: 200 });
      expect(first.isNewUser).toBe(true);
      expect(first.user.status).toBe('onboarding');
      const refreshed = await call(env, 'POST', '/auth/refresh', { body: { refreshToken: first.tokens.refreshToken }, expect: 200 });
      expect(refreshed.accessToken).toBeTruthy();
      const reused = await env.app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: first.tokens.refreshToken } });
      expect(reused.statusCode).toBe(401);
      const me = await call(env, 'GET', '/me', { token: refreshed.accessToken, expect: 200 });
      expect(me.id).toBe(first.user.id);
    });

    it('activates the account once profile and questionnaire are complete', async () => {
      const user = await signUpUser(env, cityId);
      const me = await call(env, 'GET', '/me', { token: user.token, expect: 200 });
      expect(me.status).toBe('active');
      expect(me.personalityCompleted).toBe(true);
      expect(me.personalityLabels.length).toBeGreaterThan(0);
      const profile = await call(env, 'GET', '/personality/me', { token: user.token, expect: 200 });
      expect(profile.answered).toBe(profile.total);
    });

    it('rejects under-18 birthdates', async () => {
      const verified = await call(env, 'POST', '/auth/otp/verify', { body: { phone: '+14155550101', code: '000000' }, expect: 200 });
      const res = await env.app.inject({
        method: 'PATCH',
        url: '/v1/me',
        headers: { authorization: `Bearer ${verified.tokens.accessToken}` },
        payload: { birthdate: '2015-01-01' },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('booking & payment', () => {
    let user: TestUser;
    let eventId: string;

    beforeAll(async () => {
      user = await signUpUser(env, cityId);
      const event = await createEvent(env, cityId);
      eventId = event.id;
    });

    it('lists upcoming events for the user city', async () => {
      const events = await call(env, 'GET', '/events', { token: user.token, expect: 200 });
      expect(events.some((e: any) => e.id === eventId)).toBe(true);
      expect(events.find((e: any) => e.id === eventId).myBooking).toBeNull();
    });

    it('creates a pending booking with a payment intent, then confirms after payment', async () => {
      const created = await call(env, 'POST', `/events/${eventId}/bookings`, { token: user.token, body: { preferences: { budget: 'mid' } }, expect: 201 });
      expect(created.requiresPayment).toBe(true);
      expect(created.booking.status).toBe('pending_payment');
      expect(created.booking.payment.clientSecret).toBeTruthy();

      const tooEarly = await env.app.inject({ method: 'POST', url: `/v1/bookings/${created.booking.id}/confirm`, headers: { authorization: `Bearer ${user.token}` } });
      expect(tooEarly.statusCode).toBe(402);

      await call(env, 'POST', `/payments/${created.booking.payment.id}/dev-complete`, { token: user.token, expect: 200 });
      const confirmed = await call(env, 'POST', `/bookings/${created.booking.id}/confirm`, { token: user.token, expect: 200 });
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.payment.status).toBe('succeeded');

      const event = await call(env, 'GET', `/events/${eventId}`, { token: user.token, expect: 200 });
      expect(event.myBooking.id).toBe(created.booking.id);
      expect(env.push.sent.some((p) => p.message.title === 'Your seat is booked')).toBe(false); // no device registered
      const notifications = await call(env, 'GET', '/notifications', { token: user.token, expect: 200 });
      expect(notifications[0].type).toBe('booking_confirmed');
    });

    it('prevents double booking', async () => {
      const res = await env.app.inject({ method: 'POST', url: `/v1/events/${eventId}/bookings`, headers: { authorization: `Bearer ${user.token}` }, payload: {} });
      expect(res.statusCode).toBe(409);
    });

    it('refunds when cancelling before bookings close', async () => {
      const bookings = await call(env, 'GET', '/bookings', { token: user.token, expect: 200 });
      const cancelled = await call(env, 'DELETE', `/bookings/${bookings[0].id}`, { token: user.token, expect: 200 });
      expect(cancelled.status).toBe('refunded');
      expect(cancelled.payment.status).toBe('refunded');
    });

    it('confirms members immediately without payment', async () => {
      const membership = await call(env, 'POST', '/membership', { token: user.token, expect: 201 });
      expect(membership.status).toBe('active');
      const created = await call(env, 'POST', `/events/${eventId}/bookings`, { token: user.token, body: {}, expect: 201 });
      expect(created.requiresPayment).toBe(false);
      expect(created.booking.status).toBe('confirmed');
      const me = await call(env, 'GET', '/me', { token: user.token, expect: 200 });
      expect(me.hasActiveMembership).toBe(true);
      await call(env, 'DELETE', `/bookings/${created.booking.id}`, { token: user.token, expect: 200 });
    });

    it('waitlists when the event is full and promotes on cancellation', async () => {
      const small = await createEvent(env, cityId, { capacity: 4, daysAhead: 8 });
      const users = await Promise.all([1, 2, 3, 4, 5].map(() => signUpUser(env, cityId)));
      for (const u of users.slice(0, 4)) await bookAndPay(env, u, small.id);
      const fifth = await call(env, 'POST', `/events/${small.id}/bookings`, { token: users[4]!.token, body: {}, expect: 201 });
      expect(fifth.booking.status).toBe('waitlisted');
      const event = await call(env, 'GET', `/events/${small.id}`, { token: users[0]!.token, expect: 200 });
      expect(event.spotsLeft).toBe(0);

      const first = await call(env, 'GET', '/bookings', { token: users[0]!.token, expect: 200 });
      await call(env, 'DELETE', `/bookings/${first[0].id}`, { token: users[0]!.token, expect: 200 });
      const promoted = await call(env, 'GET', `/events/${small.id}`, { token: users[4]!.token, expect: 200 });
      expect(promoted.myBooking.status).toBe('pending_payment');
    });
  });

  describe('dinner lifecycle: match, reveal, check-in, feedback, connections, chat', () => {
    let users: TestUser[];
    let eventId: string;
    let groupId: string;

    beforeAll(async () => {
      const event = await createEvent(env, cityId, { daysAhead: 5 });
      eventId = event.id;
      users = [];
      for (let i = 0; i < 6; i++) {
        users.push(await signUpUser(env, cityId, { firstName: `Guest${i}`, birthdate: `${1990 + i}-01-01`, gender: i % 2 ? 'man' : 'woman' }));
      }
      for (const u of users) await bookAndPay(env, u, eventId, { budget: 'mid' });
    });

    it('hides the table before reveal and shows it after', async () => {
      await admin(env, 'POST', `/admin/events/${eventId}/close`, undefined, 200);
      const summary = await admin(env, 'POST', `/admin/events/${eventId}/match`, { seed: 1 }, 200);
      expect(summary.groups).toHaveLength(1);
      expect(summary.groups[0].size).toBe(6);
      expect(summary.groups[0].restaurantId).toBeTruthy();
      groupId = summary.groups[0].id;

      const hidden = await call(env, 'GET', '/dinners/upcoming', { token: users[0]!.token, expect: 200 });
      expect(hidden.id).toBe(groupId);
      expect(hidden.isRevealed).toBe(false);
      expect(hidden.restaurant).toBeNull();
      expect(hidden.tablemates).toEqual([]);

      await admin(env, 'POST', `/admin/events/${eventId}/reveal`, undefined, 200);
      const revealed = await call(env, 'GET', `/dinners/${groupId}`, { token: users[0]!.token, expect: 200 });
      expect(revealed.isRevealed).toBe(true);
      expect(revealed.restaurant.name).toBe('Mid Bistro');
      expect(revealed.tablemates).toHaveLength(5);
      expect(revealed.tablemates.map((t: any) => t.firstName)).not.toContain('Guest0');
      expect(revealed.tablemates[0].age).toBeGreaterThan(18);
      expect(revealed.conversationId).toBeTruthy();

      const notifications = await call(env, 'GET', '/notifications', { token: users[1]!.token, expect: 200 });
      expect(notifications.some((n: any) => n.type === 'group_revealed')).toBe(true);
    });

    it('serves icebreakers to members only', async () => {
      await admin(env, 'POST', '/admin/icebreakers', { category: 'warmup', text: 'What was the best meal of your life?', intensity: 1 }, 201);
      const list = await call(env, 'GET', `/dinners/${groupId}/icebreakers`, { token: users[2]!.token, expect: 200 });
      expect(list.length).toBeGreaterThan(0);
      const outsider = await signUpUser(env, cityId);
      const res = await env.app.inject({ method: 'GET', url: `/v1/dinners/${groupId}/icebreakers`, headers: { authorization: `Bearer ${outsider.token}` } });
      expect(res.statusCode).toBe(404);
    });

    it('allows group chat once revealed', async () => {
      const group = await call(env, 'GET', `/dinners/${groupId}`, { token: users[0]!.token, expect: 200 });
      const sent = await call(env, 'POST', `/conversations/${group.conversationId}/messages`, { token: users[0]!.token, body: { body: 'Running 5 min late!' }, expect: 201 });
      expect(sent.senderId).toBe(users[0]!.id);
      const convs = await call(env, 'GET', '/conversations', { token: users[1]!.token, expect: 200 });
      expect(convs[0].unreadCount).toBe(1);
      expect(convs[0].kind).toBe('group');
      await call(env, 'POST', `/conversations/${group.conversationId}/read`, { token: users[1]!.token, expect: 200 });
      const after = await call(env, 'GET', '/conversations', { token: users[1]!.token, expect: 200 });
      expect(after[0].unreadCount).toBe(0);
    });

    it('enforces the check-in window', async () => {
      const early = await env.app.inject({ method: 'POST', url: `/v1/dinners/${groupId}/checkin`, headers: { authorization: `Bearer ${users[0]!.token}` } });
      expect(early.statusCode).toBe(409);
      const event = await call(env, 'GET', `/events/${eventId}`, { token: users[0]!.token, expect: 200 });
      env.clock.set(addHours(new Date(event.startsAt), -1));
      const ok = await call(env, 'POST', `/dinners/${groupId}/checkin`, { token: users[0]!.token, expect: 200 });
      expect(ok.myCheckedInAt).toBeTruthy();
      const asSeen = await call(env, 'GET', `/dinners/${groupId}`, { token: users[1]!.token, expect: 200 });
      expect(asSeen.tablemates.find((t: any) => t.userId === users[0]!.id).checkedIn).toBe(true);
    });

    it('completes the dinner, collects feedback and creates mutual connections', async () => {
      const event = await call(env, 'GET', `/events/${eventId}`, { token: users[0]!.token, expect: 200 });
      env.clock.set(addHours(new Date(event.startsAt), 5));
      await admin(env, 'POST', `/admin/events/${eventId}/complete`, undefined, 200);

      const history = await call(env, 'GET', '/dinners/history', { token: users[0]!.token, expect: 200 });
      expect(history[0].id).toBe(groupId);
      expect(history[0].status).toBe('completed');

      // u0 wants to connect with u1 and u2; u1 wants u0 -> one mutual match.
      const r0 = await call(env, 'POST', `/dinners/${groupId}/feedback`, { token: users[0]!.token, body: { rating: 5, connectWith: [users[1]!.id, users[2]!.id] }, expect: 200 });
      expect(r0.matched).toEqual([]);
      const r1 = await call(env, 'POST', `/dinners/${groupId}/feedback`, { token: users[1]!.token, body: { rating: 4, connectWith: [users[0]!.id] }, expect: 200 });
      expect(r1.matched).toEqual([users[0]!.id]);

      const mine = await call(env, 'GET', '/connections', { token: users[0]!.token, expect: 200 });
      expect(mine).toHaveLength(1);
      expect(mine[0].user.userId).toBe(users[1]!.id);
      // u2 never hears about u0's one-sided request.
      const u2 = await call(env, 'GET', '/connections', { token: users[2]!.token, expect: 200 });
      expect(u2).toHaveLength(0);

      const dm = await call(env, 'POST', `/conversations/${mine[0].conversationId}/messages`, { token: users[1]!.token, body: { body: 'Great meeting you!' }, expect: 201 });
      const messages = await call(env, 'GET', `/conversations/${mine[0].conversationId}/messages`, { token: users[0]!.token, expect: 200 });
      expect(messages.map((m: any) => m.id)).toContain(dm.id);

      const group = await call(env, 'GET', `/dinners/${groupId}`, { token: users[0]!.token, expect: 200 });
      expect(group.feedbackSubmitted).toBe(true);
    });

    it('rejects connection requests to people who were not at the table', async () => {
      const outsider = await signUpUser(env, cityId);
      const res = await env.app.inject({
        method: 'POST',
        url: `/v1/dinners/${groupId}/connect`,
        headers: { authorization: `Bearer ${users[0]!.token}` },
        payload: { userId: outsider.id },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('scheduler tick', () => {
    it('advances an event through its lifecycle as time passes', async () => {
      env.clock.set(new Date('2027-01-04T12:00:00Z'));
      const startsAt = addDays(env.clock.now(), 3);
      const event = await admin(env, 'POST', '/admin/events', { cityId, startsAt: startsAt.toISOString(), bookingOpensAt: addHours(env.clock.now(), 1).toISOString() }, 201);
      expect(event.status).toBe('scheduled');
      const lifecycle = new EventLifecycle(env.ctx);

      expect(await lifecycle.tick()).toEqual([]);
      env.clock.advance(2 * 3600_000);
      expect(await lifecycle.tick()).toEqual([`open:${event.id}`]);

      const users = [];
      for (let i = 0; i < 5; i++) users.push(await signUpUser(env, cityId, { gender: i % 2 ? 'man' : 'woman' }));
      for (const u of users) await bookAndPay(env, u, event.id);
      // One abandoned pending payment should be dropped at close.
      const abandoned = await signUpUser(env, cityId);
      await call(env, 'POST', `/events/${event.id}/bookings`, { token: abandoned.token, body: {}, expect: 201 });

      env.clock.set(new Date(event.bookingClosesAt));
      const closeActions = await lifecycle.tick();
      expect(closeActions[0]).toMatch(/^close\+match:/);
      const abandonedBookings = await call(env, 'GET', '/bookings', { token: abandoned.token, expect: 200 });
      expect(abandonedBookings[0].status).toBe('cancelled');

      env.clock.set(new Date(event.revealAt));
      expect(await lifecycle.tick()).toEqual([`reveal:${event.id}`]);
      const upcoming = await call(env, 'GET', '/dinners/upcoming', { token: users[0]!.token, expect: 200 });
      expect(upcoming.isRevealed).toBe(true);
      expect(upcoming.tablemates).toHaveLength(4);

      env.clock.set(addHours(new Date(event.startsAt), 5));
      expect(await lifecycle.tick()).toEqual([`complete:${event.id}`]);
      const final = await admin(env, 'GET', `/admin/events?includePast=true`, undefined, 200);
      expect(final.find((e: any) => e.id === event.id).status).toBe('completed');
    });

    it('generates weekly events per city', async () => {
      const created = await admin(env, 'POST', '/admin/events/generate', { weeksAhead: 3 }, 201);
      expect(created.length).toBeGreaterThanOrEqual(2);
      const again = await admin(env, 'POST', '/admin/events/generate', { weeksAhead: 3 }, 201);
      expect(again).toHaveLength(0);
    });

    it('cancels an event and refunds paid seats', async () => {
      const event = await createEvent(env, cityId, { daysAhead: 20 });
      const u = await signUpUser(env, cityId);
      await bookAndPay(env, u, event.id);
      await admin(env, 'POST', `/admin/events/${event.id}/cancel`, { reason: 'Restaurant closed' }, 200);
      const bookings = await call(env, 'GET', '/bookings', { token: u.token, expect: 200 });
      expect(bookings[0].status).toBe('refunded');
    });
  });

  describe('admin auth', () => {
    it('rejects non-admin users', async () => {
      const u = await signUpUser(env, cityId);
      const res = await env.app.inject({ method: 'GET', url: '/v1/admin/cities', headers: { authorization: `Bearer ${u.token}` } });
      expect(res.statusCode).toBe(403);
      const anon = await env.app.inject({ method: 'GET', url: '/v1/admin/cities' });
      expect(anon.statusCode).toBe(401);
    });
  });
});
