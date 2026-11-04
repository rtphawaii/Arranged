import { KyselyPGlite } from 'kysely-pglite';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createContext, type AppContext } from '../src/context.js';
import { createDbFromDialect, migrateToLatest, type Db } from '../src/db/client.js';
import { silentLogger } from '../src/lib/logger.js';
import { FixedClock, addDays, addHours } from '../src/lib/time.js';
import { FakePaymentProvider } from '../src/modules/payments/fake.js';
import { LogPushProvider } from '../src/modules/notifications/push.js';
import { QUESTIONS } from '../src/modules/personality/questions.js';

export interface TestEnv {
  app: FastifyInstance;
  ctx: AppContext;
  db: Db;
  clock: FixedClock;
  payments: FakePaymentProvider;
  push: LogPushProvider;
  adminToken: string;
  close(): Promise<void>;
}

export async function createTestEnv(start = new Date('2026-11-02T12:00:00Z')): Promise<TestEnv> {
  const { dialect } = await KyselyPGlite.create();
  const db = createDbFromDialect(dialect);
  await migrateToLatest(db);
  const clock = new FixedClock(start);
  const config = loadConfig({ NODE_ENV: 'test', OTP_PROVIDER: 'dev', OTP_DEV_CODE: '000000', PAYMENT_PROVIDER: 'fake', PUSH_PROVIDER: 'log', ADMIN_API_TOKEN: 'test-admin', RATE_LIMIT_ENABLED: 'false', ACCESS_TOKEN_TTL_SECONDS: String(10 * 365 * 86400) });
  const payments = new FakePaymentProvider(clock);
  const push = new LogPushProvider(silentLogger);
  const log = { ...silentLogger, error: (obj: unknown, msg?: string) => console.error('[test-error]', msg, (obj as { err?: Error })?.err ?? obj) };
  const ctx = createContext(config, log, { db, clock, payments, push });
  const app = await buildApp(ctx);
  await app.ready();
  return {
    app,
    ctx,
    db,
    clock,
    payments,
    push,
    adminToken: 'test-admin',
    close: async () => {
      await app.close();
      await db.destroy();
    },
  };
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function call<T = any>(
  env: TestEnv,
  method: Method,
  url: string,
  opts: { token?: string; body?: unknown; expect?: number } = {},
): Promise<T> {
  const res = await env.app.inject({
    method,
    url: `/v1${url}`,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(opts.body !== undefined ? { payload: JSON.stringify(opts.body) } : {}),
  });
  if (opts.expect !== undefined && res.statusCode !== opts.expect) {
    throw new Error(`${method} ${url} -> ${res.statusCode} (expected ${opts.expect}): ${res.body}`);
  }
  return res.body ? (res.json() as T) : (undefined as T);
}

export const admin = <T = any>(env: TestEnv, method: Method, url: string, body?: unknown, expect?: number) =>
  call<T>(env, method, url, { token: env.adminToken, body, expect });

export interface TestUser {
  id: string;
  token: string;
  phone: string;
  firstName: string;
}

let phoneCounter = 1000;

/** Signs up a user and completes onboarding (profile + questionnaire). */
export async function signUpUser(
  env: TestEnv,
  cityId: string,
  overrides: Partial<{ firstName: string; birthdate: string; gender: 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say'; languages: string[]; answerBias: number }> = {},
): Promise<TestUser> {
  const phone = `+1415555${String(phoneCounter++).padStart(4, '0')}`;
  await call(env, 'POST', '/auth/otp/request', { body: { phone }, expect: 200 });
  const verified = await call(env, 'POST', '/auth/otp/verify', { body: { phone, code: '000000' }, expect: 200 });
  const token = verified.tokens.accessToken as string;
  const firstName = overrides.firstName ?? `User${phoneCounter}`;
  await call(env, 'PATCH', '/me', {
    token,
    body: {
      firstName,
      lastName: 'Test',
      birthdate: overrides.birthdate ?? '1994-05-10',
      gender: overrides.gender ?? (phoneCounter % 2 === 0 ? 'woman' : 'man'),
      cityId,
      languages: overrides.languages ?? ['en'],
    },
    expect: 200,
  });
  const bias = overrides.answerBias ?? 3;
  const answers = Object.fromEntries(QUESTIONS.map((q, i) => [q.key, Math.min(5, Math.max(1, bias + ((i % 3) - 1)))]));
  await call(env, 'PUT', '/personality/me', { token, body: { answers }, expect: 200 });
  return { id: verified.user.id, token, phone, firstName };
}

export async function createCity(env: TestEnv, slug = 'sf') {
  return admin(env, 'POST', '/admin/cities', { slug, name: 'San Francisco', countryCode: 'US', timezone: 'America/Los_Angeles', currency: 'USD', defaultPriceCents: 1500 }, 201);
}

export async function createRestaurant(env: TestEnv, cityId: string, name = 'Trattoria Test', priceLevel = 2, maxTables = 3) {
  return admin(env, 'POST', '/admin/restaurants', { cityId, name, address: '1 Main St', priceLevel, maxTables }, 201);
}

/** Creates an event starting 7 days from the clock with bookings already open. */
export async function createEvent(env: TestEnv, cityId: string, opts: { capacity?: number | null; daysAhead?: number } = {}) {
  const startsAt = addDays(env.clock.now(), opts.daysAhead ?? 7);
  return admin(
    env,
    'POST',
    '/admin/events',
    {
      cityId,
      startsAt: startsAt.toISOString(),
      bookingOpensAt: addHours(env.clock.now(), -1).toISOString(),
      capacity: opts.capacity ?? null,
    },
    201,
  );
}

/** Books and pays for a seat for the given user. */
export async function bookAndPay(env: TestEnv, user: TestUser, eventId: string, preferences: Record<string, unknown> = {}) {
  const created = await call(env, 'POST', `/events/${eventId}/bookings`, { token: user.token, body: { preferences }, expect: 201 });
  if (created.requiresPayment) {
    await call(env, 'POST', `/payments/${created.booking.payment.id}/dev-complete`, { token: user.token, expect: 200 });
    return call(env, 'POST', `/bookings/${created.booking.id}/confirm`, { token: user.token, expect: 200 });
  }
  return created.booking;
}
