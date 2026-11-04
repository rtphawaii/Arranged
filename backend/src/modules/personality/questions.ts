/**
 * Personality questionnaire used during onboarding.
 *
 * Six dimensions, each scored 0..1 from several 1–5 Likert answers. The matching engine
 * treats some dimensions as "mix" dimensions (a good table has a spread, e.g. energy) and
 * others as "align" dimensions (a good table is similar, e.g. humour).
 */
export type Dimension = 'energy' | 'openness' | 'depth' | 'humor' | 'structure' | 'warmth';

export const DIMENSIONS: readonly Dimension[] = ['energy', 'openness', 'depth', 'humor', 'structure', 'warmth'];

export interface Question {
  key: string;
  dimension: Dimension;
  text: string;
  /** When true a high answer means a LOW score on the dimension. */
  reverse?: boolean;
}

export const LIKERT_MIN = 1;
export const LIKERT_MAX = 5;

export const QUESTIONS: readonly Question[] = [
  // energy: 0 = recharges alone, 1 = energised by people
  { key: 'energy_1', dimension: 'energy', text: 'A dinner with six strangers sounds energising, not draining.' },
  { key: 'energy_2', dimension: 'energy', text: 'I am usually the one who keeps the conversation going.' },
  { key: 'energy_3', dimension: 'energy', text: 'After a long week I prefer a quiet night in.', reverse: true },
  { key: 'energy_4', dimension: 'energy', text: 'I find it easy to talk to people I have just met.' },

  // openness: 0 = routine, 1 = novelty
  { key: 'openness_1', dimension: 'openness', text: 'I like trying dishes I cannot pronounce.' },
  { key: 'openness_2', dimension: 'openness', text: 'I would rather revisit a favourite place than try a new one.', reverse: true },
  { key: 'openness_3', dimension: 'openness', text: 'I change my mind when I hear a good argument.' },
  { key: 'openness_4', dimension: 'openness', text: 'My ideal holiday has no fixed itinerary.' },

  // depth: 0 = light conversation, 1 = deep conversation
  { key: 'depth_1', dimension: 'depth', text: 'I would rather discuss big questions than the latest series.' },
  { key: 'depth_2', dimension: 'depth', text: 'Small talk is a fine way to spend an evening.', reverse: true },
  { key: 'depth_3', dimension: 'depth', text: 'I enjoy hearing what people really think, even if we disagree.' },
  { key: 'depth_4', dimension: 'depth', text: 'I open up about personal things fairly quickly.' },

  // humor: 0 = dry / understated, 1 = playful / loud
  { key: 'humor_1', dimension: 'humor', text: 'My friends would describe me as the funny one.' },
  { key: 'humor_2', dimension: 'humor', text: 'I prefer subtle, dry humour to silliness.', reverse: true },
  { key: 'humor_3', dimension: 'humor', text: 'I laugh easily and loudly.' },
  { key: 'humor_4', dimension: 'humor', text: 'A good evening always includes some teasing.' },

  // structure: 0 = spontaneous, 1 = planner
  { key: 'structure_1', dimension: 'structure', text: 'I like to know the plan for the evening in advance.' },
  { key: 'structure_2', dimension: 'structure', text: 'I am usually on time.' },
  { key: 'structure_3', dimension: 'structure', text: 'Last-minute plans are the best plans.', reverse: true },
  { key: 'structure_4', dimension: 'structure', text: 'I keep lists for most things.' },

  // warmth: 0 = independent, 1 = community-minded
  { key: 'warmth_1', dimension: 'warmth', text: 'I remember small details about people I meet.' },
  { key: 'warmth_2', dimension: 'warmth', text: 'I prefer to figure things out on my own rather than ask for help.', reverse: true },
  { key: 'warmth_3', dimension: 'warmth', text: 'I am happiest when everyone at the table feels included.' },
  { key: 'warmth_4', dimension: 'warmth', text: 'I make an effort to stay in touch with people I like.' },
];

export const QUESTION_KEYS = new Set(QUESTIONS.map((q) => q.key));

/**
 * Computes the 6-dimension vector from a map of question key -> Likert answer (1..5).
 * Returns null when any question is unanswered.
 */
export function computePersonalityVector(answers: Record<string, number>): number[] | null {
  const sums: Record<Dimension, { total: number; n: number }> = {
    energy: { total: 0, n: 0 },
    openness: { total: 0, n: 0 },
    depth: { total: 0, n: 0 },
    humor: { total: 0, n: 0 },
    structure: { total: 0, n: 0 },
    warmth: { total: 0, n: 0 },
  };
  for (const q of QUESTIONS) {
    const raw = answers[q.key];
    if (raw === undefined) return null;
    const clamped = Math.min(LIKERT_MAX, Math.max(LIKERT_MIN, raw));
    const normalized = (clamped - LIKERT_MIN) / (LIKERT_MAX - LIKERT_MIN);
    const value = q.reverse ? 1 - normalized : normalized;
    sums[q.dimension].total += value;
    sums[q.dimension].n += 1;
  }
  return DIMENSIONS.map((d) => Number((sums[d].total / sums[d].n).toFixed(4)));
}

/** Short, friendly labels used on the "your table" screen. */
export function describeVector(vector: number[]): string[] {
  const labels: string[] = [];
  const v = (d: Dimension) => vector[DIMENSIONS.indexOf(d)] ?? 0.5;
  labels.push(v('energy') >= 0.6 ? 'Social spark' : v('energy') <= 0.4 ? 'Calm presence' : 'Easy-going');
  labels.push(v('openness') >= 0.6 ? 'Adventurous palate' : 'Comfort seeker');
  labels.push(v('depth') >= 0.6 ? 'Deep talker' : 'Light & breezy');
  if (v('humor') >= 0.6) labels.push('Brings the laughs');
  if (v('structure') >= 0.6) labels.push('Planner');
  if (v('warmth') >= 0.6) labels.push('Connector');
  return labels.slice(0, 4);
}
