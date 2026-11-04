import { describe, expect, it } from 'vitest';
import { matchTables, planTableSizes, tableCost, type Candidate } from '../src/modules/matching/algorithm.js';

function candidate(overrides: Partial<Candidate> & { userId: string }): Candidate {
  return {
    bookingId: `b-${overrides.userId}`,
    age: 30,
    gender: 'woman',
    languages: ['en'],
    personality: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    budget: 'any',
    dietary: [],
    sameAgeGroup: false,
    previousTablemates: new Set(),
    blocked: new Set(),
    bookedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('planTableSizes', () => {
  it('prefers full tables of six', () => {
    expect(planTableSizes(12, 4, 6)).toEqual([6, 6]);
    expect(planTableSizes(11, 4, 6)).toEqual([6, 5]);
    expect(planTableSizes(10, 4, 6)).toEqual([5, 5]);
    expect(planTableSizes(9, 4, 6)).toEqual([5, 4]);
  });
  it('returns nothing below the minimum', () => {
    expect(planTableSizes(3, 4, 6)).toEqual([]);
  });
  it('drops leftovers that cannot form a table', () => {
    expect(planTableSizes(7, 4, 6)).toEqual([6]);
    expect(planTableSizes(13, 4, 6)).toEqual([5, 4, 4]);
  });
});

describe('matchTables', () => {
  it('waitlists everyone when there are too few people', () => {
    const r = matchTables([candidate({ userId: 'a' }), candidate({ userId: 'b' })]);
    expect(r.tables).toHaveLength(0);
    expect(r.unassigned).toHaveLength(2);
  });

  it('is deterministic for a given seed', () => {
    const people = Array.from({ length: 12 }, (_, i) => candidate({ userId: `u${i}`, age: 24 + i * 2, gender: i % 2 ? 'man' : 'woman' }));
    const a = matchTables(people, { seed: 7 });
    const b = matchTables(people, { seed: 7 });
    expect(a.tables.map((t) => t.members.map((m) => m.userId))).toEqual(b.tables.map((t) => t.members.map((m) => m.userId)));
  });

  it('keeps blocked users apart', () => {
    const people = Array.from({ length: 12 }, (_, i) => candidate({ userId: `u${i}`, gender: i % 2 ? 'man' : 'woman' }));
    people[0]!.blocked = new Set(['u1']);
    people[1]!.blocked = new Set(['u0']);
    const r = matchTables(people, { seed: 1 });
    const tableOf = (id: string) => r.tables.findIndex((t) => t.members.some((m) => m.userId === id));
    expect(tableOf('u0')).not.toBe(tableOf('u1'));
    expect(tableOf('u0')).toBeGreaterThanOrEqual(0);
  });

  it('groups people who share a language', () => {
    const english = Array.from({ length: 6 }, (_, i) => candidate({ userId: `en${i}`, languages: ['en'], gender: i % 2 ? 'man' : 'woman' }));
    const french = Array.from({ length: 6 }, (_, i) => candidate({ userId: `fr${i}`, languages: ['fr'], gender: i % 2 ? 'man' : 'woman' }));
    // Interleave ages so the age-sorted baseline mixes languages.
    english.forEach((c, i) => (c.age = 25 + i * 2));
    french.forEach((c, i) => (c.age = 26 + i * 2));
    const r = matchTables([...english, ...french], { seed: 3 });
    for (const t of r.tables) {
      const langs = new Set(t.members.map((m) => m.languages[0]));
      expect(langs.size).toBe(1);
    }
  });

  it('gives earlier bookings priority when over capacity', () => {
    const people = Array.from({ length: 7 }, (_, i) => candidate({ userId: `u${i}`, bookedAt: new Date(2026, 0, 1, i) }));
    const r = matchTables(people);
    expect(r.unassigned.map((c) => c.userId)).toEqual(['u6']);
  });

  it('penalises wide age spread and lone genders', () => {
    const tight = [25, 26, 27, 28, 29, 30].map((age, i) => candidate({ userId: `t${i}`, age, gender: i % 2 ? 'man' : 'woman' }));
    const wide = [22, 30, 38, 46, 54, 62].map((age, i) => candidate({ userId: `w${i}`, age, gender: i % 2 ? 'man' : 'woman' }));
    expect(tableCost(tight)).toBeLessThan(tableCost(wide));
    const lone = [25, 26, 27, 28, 29, 30].map((age, i) => candidate({ userId: `l${i}`, age, gender: i === 0 ? 'woman' : 'man' }));
    expect(tableCost(lone)).toBeGreaterThan(tableCost(tight));
  });
});
