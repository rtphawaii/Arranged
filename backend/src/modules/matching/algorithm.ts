/**
 * Table-matching engine.
 *
 * Pure and deterministic (given a seed) so it can be unit-tested and replayed. It takes the
 * confirmed bookings of one dinner event and produces tables of `minSize..maxSize` people.
 *
 * Strategy:
 *   1. Sort candidates by age and chunk them into tables (good baseline for age coherence).
 *   2. Hill-climb with random pairwise swaps between tables, accepting a swap when it lowers the
 *      total cost. Cost is a weighted sum of soft constraints (age spread, gender balance, common
 *      language, budget, personality blend, repeat tablemates) and hard constraints (blocks).
 *   3. Candidates that don't fit into a table of at least `minSize` are returned as `unassigned`
 *      (they get waitlisted / refunded by the caller).
 */

export type MatchGender = 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say';
export type Budget = 'low' | 'mid' | 'high' | 'any';

export interface Candidate {
  userId: string;
  bookingId: string;
  age: number;
  gender: MatchGender;
  languages: string[];
  /** Six-dimension vector from the questionnaire, or null if not completed. */
  personality: number[] | null;
  budget: Budget;
  dietary: string[];
  sameAgeGroup: boolean;
  /** User ids this person has already shared a table with. */
  previousTablemates: Set<string>;
  /** User ids this person has blocked or been blocked by. */
  blocked: Set<string>;
  /** Earlier bookings get priority when someone has to be left out. */
  bookedAt: Date;
}

export interface MatchedTable {
  members: Candidate[];
  cost: number;
}

export interface MatchResult {
  tables: MatchedTable[];
  unassigned: Candidate[];
  totalCost: number;
  iterations: number;
}

export interface MatchOptions {
  minSize?: number;
  maxSize?: number;
  seed?: number;
  iterations?: number;
  weights?: Partial<Weights>;
}

export interface Weights {
  ageSpread: number;
  ageSpreadStrict: number;
  genderImbalance: number;
  loneGender: number;
  noCommonLanguage: number;
  budgetClash: number;
  repeatTablemate: number;
  blockedPair: number;
  personalityAlign: number;
  personalityMix: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  ageSpread: 1.0,
  ageSpreadStrict: 2.0,
  genderImbalance: 1.5,
  loneGender: 4.0,
  noCommonLanguage: 25.0,
  budgetClash: 3.0,
  repeatTablemate: 6.0,
  blockedPair: 1000.0,
  personalityAlign: 6.0,
  personalityMix: 4.0,
};

/** Dimensions where we want people to be similar (indices into the personality vector). */
const ALIGN_DIMS = [1, 2, 3]; // openness, depth, humor
/** Dimensions where a spread makes for a livelier table. */
const MIX_DIMS = [0, 5]; // energy, warmth

const AGE_SPREAD_FREE = 8;
const AGE_SPREAD_STRICT_FREE = 5;

export function matchTables(candidates: Candidate[], options: MatchOptions = {}): MatchResult {
  const minSize = options.minSize ?? 4;
  const maxSize = options.maxSize ?? 6;
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const rng = mulberry32(options.seed ?? 42);
  const iterations = options.iterations ?? Math.max(2000, candidates.length * 60);

  if (candidates.length < minSize) {
    return { tables: [], unassigned: [...candidates], totalCost: 0, iterations: 0 };
  }

  // Decide table sizes.
  const sizes = planTableSizes(candidates.length, minSize, maxSize);
  const seats = sizes.reduce((a, b) => a + b, 0);

  // Priority: earliest bookings keep their seats if we are over capacity.
  const byPriority = [...candidates].sort((a, b) => a.bookedAt.getTime() - b.bookedAt.getTime());
  const seated = byPriority.slice(0, seats);
  const unassigned = byPriority.slice(seats);

  // Baseline: sort by age and chunk.
  const byAge = [...seated].sort((a, b) => a.age - b.age || a.userId.localeCompare(b.userId));
  const tables: Candidate[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    tables.push(byAge.slice(cursor, cursor + size));
    cursor += size;
  }

  const costs = tables.map((t) => tableCost(t, weights));
  let total = costs.reduce((a, b) => a + b, 0);

  // Hill climbing with random swaps.
  let done = 0;
  if (tables.length > 1) {
    for (let i = 0; i < iterations; i++) {
      done++;
      const a = Math.floor(rng() * tables.length);
      let b = Math.floor(rng() * (tables.length - 1));
      if (b >= a) b++;
      const ta = tables[a]!;
      const tb = tables[b]!;
      const ia = Math.floor(rng() * ta.length);
      const ib = Math.floor(rng() * tb.length);
      const ca = ta[ia]!;
      const cb = tb[ib]!;
      ta[ia] = cb;
      tb[ib] = ca;
      const newA = tableCost(ta, weights);
      const newB = tableCost(tb, weights);
      const delta = newA + newB - costs[a]! - costs[b]!;
      if (delta < 0) {
        costs[a] = newA;
        costs[b] = newB;
        total += delta;
      } else {
        ta[ia] = ca;
        tb[ib] = cb;
      }
    }
  }

  return {
    tables: tables.map((members, i) => ({ members, cost: costs[i]! })),
    unassigned,
    totalCost: total,
    iterations: done,
  };
}

/** Splits `n` people into table sizes within [min, max], preferring full tables. Leftovers are dropped. */
export function planTableSizes(n: number, minSize: number, maxSize: number): number[] {
  if (n < minSize) return [];
  // Try the smallest number of tables first.
  for (let tables = Math.ceil(n / maxSize); tables <= Math.floor(n / minSize); tables++) {
    const base = Math.floor(n / tables);
    const extra = n % tables;
    if (base >= minSize && base + (extra > 0 ? 1 : 0) <= maxSize) {
      return Array.from({ length: tables }, (_, i) => base + (i < extra ? 1 : 0));
    }
  }
  // No exact split: fill as many full tables as possible and leave the rest out.
  const tables = Math.floor(n / maxSize);
  const sizes = Array.from({ length: tables }, () => maxSize);
  const rest = n - tables * maxSize;
  if (rest >= minSize) sizes.push(rest);
  return sizes;
}

export function tableCost(members: Candidate[], w: Weights = DEFAULT_WEIGHTS): number {
  if (members.length === 0) return 0;
  let cost = 0;

  // Age.
  const ages = members.map((m) => m.age);
  const spread = Math.max(...ages) - Math.min(...ages);
  cost += w.ageSpread * Math.max(0, spread - AGE_SPREAD_FREE);
  if (members.some((m) => m.sameAgeGroup)) {
    cost += w.ageSpreadStrict * Math.max(0, spread - AGE_SPREAD_STRICT_FREE);
  }

  // Gender balance.
  const women = members.filter((m) => m.gender === 'woman').length;
  const men = members.filter((m) => m.gender === 'man').length;
  cost += w.genderImbalance * Math.max(0, Math.abs(women - men) - 1);
  if ((women === 1 && men >= 3) || (men === 1 && women >= 3)) cost += w.loneGender;

  // Shared language: every member who cannot speak the table's most common language costs a penalty,
  // which gives the optimiser a gradient instead of an all-or-nothing cliff.
  const speakers = new Map<string, number>();
  for (const m of members) {
    for (const l of new Set(m.languages.map((x) => x.toLowerCase()))) speakers.set(l, (speakers.get(l) ?? 0) + 1);
  }
  const maxSpeakers = Math.max(0, ...speakers.values());
  cost += w.noCommonLanguage * (members.length - maxSpeakers);

  // Budget.
  const budgets = new Set(members.map((m) => m.budget).filter((b) => b !== 'any'));
  if (budgets.has('low') && budgets.has('high')) cost += w.budgetClash;

  // Pairwise: repeats and blocks.
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]!;
      const b = members[j]!;
      if (a.previousTablemates.has(b.userId) || b.previousTablemates.has(a.userId)) cost += w.repeatTablemate;
      if (a.blocked.has(b.userId) || b.blocked.has(a.userId)) cost += w.blockedPair;
    }
  }

  // Personality.
  const vectors = members.map((m) => m.personality).filter((v): v is number[] => Array.isArray(v) && v.length >= 6);
  if (vectors.length >= 2) {
    for (const d of ALIGN_DIMS) cost += w.personalityAlign * stddev(vectors.map((v) => v[d]!));
    for (const d of MIX_DIMS) {
      // Ideal spread ~0.25; penalise tables that are all the same.
      const sd = stddev(vectors.map((v) => v[d]!));
      cost += w.personalityMix * Math.max(0, 0.2 - sd);
    }
  }

  return Number(cost.toFixed(4));
}

function stddev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Small deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks a restaurant for a table given budget / dietary constraints and remaining capacity. */
export interface RestaurantOption {
  id: string;
  priceLevel: number; // 1..4
  remainingTables: number;
}

export function pickRestaurant(table: Candidate[], options: RestaurantOption[]): RestaurantOption | null {
  const budgets = table.map((m) => m.budget).filter((b) => b !== 'any');
  const wantsLow = budgets.includes('low');
  const wantsHigh = budgets.includes('high') && !wantsLow;
  const target = wantsLow ? 1.5 : wantsHigh ? 3.5 : 2.5;
  const available = options.filter((o) => o.remainingTables > 0);
  if (available.length === 0) return null;
  available.sort((a, b) => Math.abs(a.priceLevel - target) - Math.abs(b.priceLevel - target) || b.remainingTables - a.remainingTables);
  return available[0] ?? null;
}
