/**
 * Hotel business-date helpers.
 *
 * Business dates (arrival, departure, night dates) are plain calendar dates in the
 * property's time zone, represented as ISO strings "YYYY-MM-DD". They are never
 * converted through UTC timestamps, which avoids off-by-one errors around midnight.
 *
 * Stay convention: the arrival date is included and the departure date is excluded.
 * A stay from 2026-05-01 to 2026-05-03 occupies the nights of 05-01 and 05-02.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtcMidnight(date: string): Date {
  if (!isIsoDate(date)) throw new Error(`Invalid business date: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  const d = toUtcMidnight(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Number of nights between arrival (inclusive) and departure (exclusive). */
export function nightCount(arrival: string, departure: string): number {
  const ms = toUtcMidnight(departure).getTime() - toUtcMidnight(arrival).getTime();
  return Math.round(ms / 86_400_000);
}

/** The list of night dates occupied by a stay. */
export function stayNights(arrival: string, departure: string): string[] {
  const n = nightCount(arrival, departure);
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => addDays(arrival, i));
}

/** Two half-open date ranges [a1, a2) and [b1, b2) overlap. */
export function rangesOverlap(a1: string, a2: string, b1: string, b2: string): boolean {
  return a1 < b2 && b1 < a2;
}

/** ISO weekday 1 (Monday) .. 7 (Sunday) of a business date. */
export function isoWeekday(date: string): number {
  const day = toUtcMidnight(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Current business date in a given IANA time zone. */
export function businessDateInZone(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Converts a JS Date holding a DB `date` column (UTC midnight) to "YYYY-MM-DD". */
export function dateColumnToIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Converts "YYYY-MM-DD" to a Date suitable for a DB `date` column. */
export function isoToDateColumn(value: string): Date {
  return toUtcMidnight(value);
}
