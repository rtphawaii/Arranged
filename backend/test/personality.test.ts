import { describe, expect, it } from 'vitest';
import { QUESTIONS, computePersonalityVector, describeVector } from '../src/modules/personality/questions.js';
import { ageAt, nextWeekdayAt } from '../src/lib/time.js';

describe('computePersonalityVector', () => {
  it('returns null until every question is answered', () => {
    expect(computePersonalityVector({ energy_1: 5 })).toBeNull();
  });
  it('maps all-max answers to 1 on forward items and 0 on reversed items', () => {
    const answers = Object.fromEntries(QUESTIONS.map((q) => [q.key, 5]));
    const v = computePersonalityVector(answers)!;
    expect(v).toHaveLength(6);
    // energy has 3 forward + 1 reversed question: (1+1+0+1)/4
    expect(v[0]).toBeCloseTo(0.75, 3);
  });
  it('describes a vector with short labels', () => {
    const labels = describeVector([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(labels).toContain('Social spark');
    expect(labels.length).toBeLessThanOrEqual(4);
  });
});

describe('time helpers', () => {
  it('computes age', () => {
    expect(ageAt('1994-05-10', new Date('2026-05-09T00:00:00Z'))).toBe(31);
    expect(ageAt('1994-05-10', new Date('2026-05-10T00:00:00Z'))).toBe(32);
  });
  it('finds the next Wednesday 19:30 in a timezone', () => {
    const from = new Date('2026-11-02T12:00:00Z'); // Monday
    const next = nextWeekdayAt(from, 3, 19, 30, 'America/Los_Angeles');
    // Wed 4 Nov 2026 19:30 PST = 03:30Z on 5 Nov
    expect(next.toISOString()).toBe('2026-11-05T03:30:00.000Z');
    const following = nextWeekdayAt(next, 3, 19, 30, 'America/Los_Angeles');
    expect(following.toISOString()).toBe('2026-11-12T03:30:00.000Z');
  });
});
