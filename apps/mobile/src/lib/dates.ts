// Dates are always the shop's dates (America/Toronto for the pilot), whatever the phone's time zone.
import { addDays, type Day } from '@quarti/rules';
import i18n from '../i18n';

export function todayIn(tz: string, now = new Date()): Day {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
/** minutes since midnight now, in the shop's time zone */
export function nowMinIn(tz: string, now = new Date()): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0), m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}
const loc = () => (i18n.language === 'fr' ? 'fr-CA' : 'en-CA');
const asDate = (d: Day) => new Date(d + 'T12:00:00Z');
/** "Fri Oct 2" / "ven. 2 oct." */
export function dayLabel(d: Day): string { return asDate(d).toLocaleDateString(loc(), { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }
/** "Friday, October 2" */
export function dayLong(d: Day): string { return asDate(d).toLocaleDateString(loc(), { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }); }
export function weekdayShort(d: Day): string { return asDate(d).toLocaleDateString(loc(), { weekday: 'short', timeZone: 'UTC' }); }
export function dayNum(d: Day): string { return String(Number(d.slice(8, 10))); }
export function days(from: Day, n: number): Day[] { return Array.from({ length: n }, (_, i) => addDays(from, i)); }
