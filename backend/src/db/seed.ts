/**
 * Development seed: a city, restaurants, icebreakers, an admin user, a dozen onboarded members
 * and the next four weekly dinners. Safe to re-run (idempotent on slugs/phones).
 */
import { loadConfig } from '../config.js';
import { createContext } from '../context.js';
import { createPostgresDb, migrateToLatest } from './client.js';
import { newId } from '../lib/ids.js';
import { silentLogger } from '../lib/logger.js';
import { EventService } from '../modules/events/service.js';
import { QUESTIONS, computePersonalityVector } from '../modules/personality/questions.js';

const config = loadConfig();
const db = createPostgresDb(config.DATABASE_URL);
await migrateToLatest(db);
const ctx = createContext(config, silentLogger, { db });
const now = new Date();

const cities = [
  { slug: 'sf', name: 'San Francisco', country_code: 'US', timezone: 'America/Los_Angeles', currency: 'USD', default_price_cents: 1800 },
  { slug: 'nyc', name: 'New York', country_code: 'US', timezone: 'America/New_York', currency: 'USD', default_price_cents: 2000 },
];
const cityIds: Record<string, string> = {};
for (const c of cities) {
  const existing = await db.selectFrom('cities').select('id').where('slug', '=', c.slug).executeTakeFirst();
  if (existing) {
    cityIds[c.slug] = existing.id;
    continue;
  }
  const id = newId();
  await db.insertInto('cities').values({ id, ...c, dinner_weekday: 3, dinner_hour: 19, dinner_minute: 30, is_active: true, created_at: now }).execute();
  cityIds[c.slug] = id;
}

const restaurants = [
  { city: 'sf', name: 'Nopalito', address: '306 Broderick St', neighborhood: 'NoPa', cuisine: 'Mexican', price_level: 2, max_tables: 3 },
  { city: 'sf', name: 'Burma Superstar', address: '309 Clement St', neighborhood: 'Inner Richmond', cuisine: 'Burmese', price_level: 2, max_tables: 2 },
  { city: 'sf', name: 'Zuni Café', address: '1658 Market St', neighborhood: 'Hayes Valley', cuisine: 'Californian', price_level: 3, max_tables: 2 },
  { city: 'sf', name: 'Yamo', address: '3406 18th St', neighborhood: 'Mission', cuisine: 'Burmese', price_level: 1, max_tables: 1 },
  { city: 'nyc', name: 'Via Carota', address: '51 Grove St', neighborhood: 'West Village', cuisine: 'Italian', price_level: 3, max_tables: 2 },
  { city: 'nyc', name: 'Xi’an Famous Foods', address: '81 St Marks Pl', neighborhood: 'East Village', cuisine: 'Chinese', price_level: 1, max_tables: 2 },
];
for (const r of restaurants) {
  const exists = await db.selectFrom('restaurants').select('id').where('name', '=', r.name).executeTakeFirst();
  if (exists) continue;
  const { city, ...rest } = r;
  await db
    .insertInto('restaurants')
    .values({ id: newId(), city_id: cityIds[city]!, ...rest, latitude: null, longitude: null, booking_notes: null, phone: null, website_url: null, is_active: true, created_at: now })
    .execute();
}

const icebreakers: Array<[string, string, number]> = [
  ['warmup', 'What is the best meal you have had in this city?', 1],
  ['warmup', 'What brought you to this dinner tonight?', 1],
  ['warmup', 'What is a small thing that made your week better?', 1],
  ['story', 'What is a trip that changed how you see things?', 2],
  ['story', 'What is something you were wrong about for years?', 2],
  ['story', 'Which hobby would you pick up if time were not an issue?', 2],
  ['deep', 'What does a good friendship look like to you now, versus ten years ago?', 3],
  ['deep', 'What is something you are working on becoming?', 3],
];
const existingIce = await db.selectFrom('icebreakers').select(({ fn }) => fn.countAll<number>().as('count')).executeTakeFirstOrThrow();
if (Number(existingIce.count) === 0) {
  await db.insertInto('icebreakers').values(icebreakers.map(([category, text, intensity]) => ({ locale: 'en', category, text, intensity, is_active: true }))).execute();
}

const people = [
  ['Admin', 'User', '+10000000000', '1990-01-01', 'prefer_not_to_say', 'admin'],
  ['Maya', 'Chen', '+14155550001', '1994-03-12', 'woman', 'member'],
  ['Leo', 'Martins', '+14155550002', '1991-07-30', 'man', 'member'],
  ['Priya', 'Natarajan', '+14155550003', '1996-11-02', 'woman', 'member'],
  ['Jonas', 'Weber', '+14155550004', '1989-05-19', 'man', 'member'],
  ['Sofia', 'Rossi', '+14155550005', '1993-09-08', 'woman', 'member'],
  ['Daniel', 'Okafor', '+14155550006', '1995-01-25', 'man', 'member'],
  ['Hana', 'Sato', '+14155550007', '1992-12-14', 'woman', 'member'],
  ['Marco', 'Silva', '+14155550008', '1990-04-03', 'man', 'member'],
  ['Elena', 'Petrova', '+14155550009', '1997-06-21', 'woman', 'member'],
  ['Tom', 'Nguyen', '+14155550010', '1988-10-10', 'man', 'member'],
  ['Aisha', 'Khan', '+14155550011', '1995-08-17', 'woman', 'member'],
  ['Ben', 'Fischer', '+14155550012', '1993-02-27', 'man', 'member'],
] as const;

for (const [i, [first, last, phone, birthdate, gender, role]] of people.entries()) {
  const exists = await db.selectFrom('users').select('id').where('phone', '=', phone).executeTakeFirst();
  if (exists) continue;
  const answers = Object.fromEntries(QUESTIONS.map((q, qi) => [q.key, 1 + ((i * 7 + qi * 3) % 5)]));
  const vector = computePersonalityVector(answers)!;
  const userId = newId();
  await db
    .insertInto('users')
    .values({
      id: userId,
      phone,
      email: null,
      first_name: first,
      last_name: last,
      birthdate,
      gender,
      city_id: cityIds.sf!,
      locale: 'en',
      languages: JSON.stringify(['en']),
      job_title: ['Designer', 'Engineer', 'Nurse', 'Teacher', 'Founder', 'Chef'][i % 6]!,
      bio: null,
      photo_url: null,
      dietary: JSON.stringify(i % 4 === 0 ? ['vegetarian'] : []),
      role,
      status: 'active',
      personality_vector: JSON.stringify(vector),
      personality_completed_at: now,
      referral_code: `SEED${String(i).padStart(3, '0')}`,
      referred_by_user_id: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  await db
    .insertInto('personality_answers')
    .values(Object.entries(answers).map(([question_key, value]) => ({ user_id: userId, question_key, value, answered_at: now })))
    .execute();
}

const events = new EventService(ctx);
const created = await events.generateWeekly(4);
console.log(`Seeded ${cities.length} cities, ${restaurants.length} restaurants, ${people.length} users; created ${created.length} new events.`);
console.log('Sign in with any seeded phone (e.g. +14155550001) and OTP code', config.OTP_DEV_CODE);
await db.destroy();
