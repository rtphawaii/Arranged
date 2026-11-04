export type Clock = { now(): Date };

export const systemClock: Clock = { now: () => new Date() };

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  set(date: Date) {
    this.current = new Date(date);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
export const addHours = (d: Date, h: number) => addMinutes(d, h * 60);
export const addDays = (d: Date, days: number) => addHours(d, days * 24);

/** Normalises a DATE column value (string from `pg`, Date from PGlite) to YYYY-MM-DD. */
export function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Age in whole years at `at` for a birthdate given as YYYY-MM-DD. */
export function ageAt(birthdate: string, at: Date): number {
  const [y, m, d] = birthdate.split('-').map(Number) as [number, number, number];
  let age = at.getUTCFullYear() - y;
  const monthDiff = at.getUTCMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && at.getUTCDate() < d)) age -= 1;
  return age;
}

/**
 * Next occurrence of `weekday` (0=Sunday..6=Saturday) at `hour:minute` local time in `timeZone`,
 * strictly after `from`. Returns the instant as a Date.
 */
export function nextWeekdayAt(from: Date, weekday: number, hour: number, minute: number, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(from);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const localWeekday = weekdays.indexOf(get('weekday'));
  const localYear = Number(get('year'));
  const localMonth = Number(get('month'));
  const localDay = Number(get('day'));
  const localHour = Number(get('hour')) % 24;
  const localMinute = Number(get('minute'));

  let daysAhead = (weekday - localWeekday + 7) % 7;
  if (daysAhead === 0 && (localHour > hour || (localHour === hour && localMinute >= minute))) daysAhead = 7;

  const targetLocal = new Date(Date.UTC(localYear, localMonth - 1, localDay + daysAhead, hour, minute, 0));
  return localToInstant(targetLocal, timeZone);
}

/** Interprets `local` (whose UTC fields are read as wall-clock values) in `timeZone` and returns the instant. */
export function localToInstant(local: Date, timeZone: string): Date {
  const guess = new Date(local.getTime());
  const offset = tzOffsetMs(guess, timeZone);
  const result = new Date(local.getTime() - offset);
  // Second pass handles DST boundaries.
  const offset2 = tzOffsetMs(result, timeZone);
  return offset2 === offset ? result : new Date(local.getTime() - offset2);
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - date.getTime();
}
