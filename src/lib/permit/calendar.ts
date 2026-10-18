/**
 * Business days in Colombia: Monday to Friday, excluding public holidays.
 * Holidays follow Ley 51 de 1983 (Ley Emiliani): some move to the following Monday.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Easter Sunday (Meeus/Jones/Butcher algorithm). */
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month, day);
}

/** Moves a date to the next Monday unless it already is one. */
const nextMonday = (d: Date) => {
  const dow = d.getUTCDay();
  return dow === 1 ? d : addDays(d, (8 - dow) % 7);
};

const cache = new Map<number, Set<string>>();

export function holidays(y: number): Set<string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const e = easter(y);
  const fixed = [utc(y, 1, 1), utc(y, 5, 1), utc(y, 7, 20), utc(y, 8, 7), utc(y, 12, 8), utc(y, 12, 25)];
  const emiliani = [
    utc(y, 1, 6), utc(y, 3, 19), utc(y, 6, 29), utc(y, 8, 15),
    utc(y, 10, 12), utc(y, 11, 1), utc(y, 11, 11),
  ].map(nextMonday);
  const religious = [
    addDays(e, -3), // Holy Thursday
    addDays(e, -2), // Good Friday
    nextMonday(addDays(e, 39)), // Ascension
    nextMonday(addDays(e, 60)), // Corpus Christi
    nextMonday(addDays(e, 68)), // Sacred Heart
  ];
  const set = new Set([...fixed, ...emiliani, ...religious].map(iso));
  cache.set(y, set);
  return set;
}

export function isBusinessDay(isoDate: string): boolean {
  const d = new Date(isoDate + 'T00:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !holidays(d.getUTCFullYear()).has(isoDate);
}

/** Subtracts n business days from a date (the starting date is not counted). */
export function subtractBusinessDays(isoDate: string, n: number): string {
  let d = new Date(isoDate + 'T00:00:00Z');
  let left = n;
  while (left > 0) {
    d = addDays(d, -1);
    if (isBusinessDay(iso(d))) left--;
  }
  return iso(d);
}

/** Business days between two dates, excluding `from` and including `to`. */
export function businessDaysBetween(from: string, to: string): number {
  let d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  let n = 0;
  while (d < end) {
    d = addDays(d, 1);
    if (isBusinessDay(iso(d))) n++;
  }
  return n;
}

export function subtractMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** 2026-11-12 → "12/11/2026" (how dates are written in the forms). */
export const shortDate = (d: string) => d.split('-').reverse().join('/');

/** 2026-11-12 → "jueves 12 de noviembre de 2026". */
export function longDate(value: string): string {
  const d = new Date(value + 'T00:00:00Z');
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** Today's date in Bogotá (UTC-5, no daylight saving time). */
export const todayIso = () => iso(new Date(Date.now() - 5 * 3_600_000));
