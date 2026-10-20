// Scheduling rules the app uses for instant feedback (greying out who can't take a slot, counts, labels).
// The database enforces the same rules on every request (supabase/migrations); these never replace that.
// Times are minutes on the shift's own day: 22:00–02:00 is 1320–1560. Days are 'YYYY-MM-DD' in the shop's time zone.

export type Day = string;

export type Slot = {
  id: string;
  day: Day;
  positionId: string;
  periodId: string | null;
  startMin: number;
  endMin: number;
  staffId: string | null;
  confirm: 'ok' | 'draft' | 'pending';
  status?: 'active' | 'cancelled';
  declinedBy?: string | null;
};

export type Period = { id: string; name: string; startMin: number; endMin: number; sort?: number };

export type StaffMember = {
  id: string;
  fullName: string;
  status: 'new' | 'active' | 'inactive';
  backOn?: Day | null;
  removed?: boolean;
  mainPositionId: string | null;
  rates: Record<string, number>; // positionId → cents
};

// ── days ──
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isDay(s: string): boolean { return DAY_RE.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')); }
export function addDays(day: Day, n: number): Day {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayDiff(a: Day, b: Day): number { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
/** 0 = Monday … 6 = Sunday */
export function weekday(day: Day): number { return (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7; }
/** Monday to Sunday around a day */
export function weekRange(day: Day): [Day, Day] { const a = addDays(day, -weekday(day)); return [a, addDays(a, 6)]; }

// ── times ──
export function hhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** "07:00", "7:00", "0700" → 420; null when it isn't a time */
export function parseHHMM(s: string): number | null {
  const m = /^\s*(\d{1,2}):?(\d{2})\s*$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}
/** a typed start/end pair on one day: an end at or before the start means it runs past midnight */
export function span(startMin: number, endTyped: number): { startMin: number; endMin: number } {
  const len = ((endTyped - startMin) % 1440 + 1440) % 1440 || 1440;
  return { startMin, endMin: startMin + len };
}
export function durationLabel(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}
export function timesLabel(s: { startMin: number; endMin: number }): string { return `${hhmm(s.startMin)}–${hhmm(s.endMin)}`; }

/** the same validation the database applies to a shift's times */
export function shiftTimesError(startMin: number, endMin: number): 'bad_times' | 'too_short' | 'too_long' | null {
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin) || startMin < 0 || startMin > 1439 || endMin <= startMin) return 'bad_times';
  if (endMin - startMin < 30) return 'too_short';
  if (endMin - startMin > 960) return 'too_long';
  return null;
}

// ── periods ──
/** the period a shift overlaps most (ties: the earlier period), or null outside every period */
export function periodFor(startMin: number, endMin: number, periods: Period[]): Period | null {
  let best: Period | null = null, bestLen = 0;
  for (const p of [...periods].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.startMin - b.startMin)) {
    const len = Math.min(p.endMin, endMin) - Math.max(p.startMin, startMin);
    if (len > bestLen) { best = p; bestLen = len; }
  }
  return best;
}

// ── who can take a slot (preview) ──
/** absolute minutes from an anchor day, so overnight shifts compare correctly across days */
function absStart(s: Pick<Slot, 'day' | 'startMin'>, anchor: Day) { return dayDiff(anchor, s.day) * 1440 + s.startMin; }
function absEnd(s: Pick<Slot, 'day' | 'endMin'>, anchor: Day) { return dayDiff(anchor, s.day) * 1440 + s.endMin; }
export function overlaps(a: Pick<Slot, 'day' | 'startMin' | 'endMin'>, b: Pick<Slot, 'day' | 'startMin' | 'endMin'>): boolean {
  return absStart(a, a.day) < absEnd(b, a.day) && absStart(b, a.day) < absEnd(a, a.day);
}

export type WhyNot = null | { code: 'removed' | 'inactive' | 'double_booked' | 'no_rate'; clash?: Slot };

export function isActiveOn(m: StaffMember, day: Day): boolean {
  if (m.removed) return false;
  if (m.status !== 'inactive') return true;
  return !!m.backOn && m.backOn <= day;
}

/** why this person can't be put on this slot, or null. `booked` = every active shift with someone on it. */
export function whyNot(m: StaffMember, slot: Slot, booked: Slot[]): WhyNot {
  if (m.removed) return { code: 'removed' };
  if (!isActiveOn(m, slot.day)) return { code: 'inactive' };
  const clash = booked.find((b) => b.id !== slot.id && b.staffId === m.id && b.status !== 'cancelled' && overlaps(b, slot));
  if (clash) return { code: 'double_booked', clash };
  if (rateFor(m, slot.positionId) == null) return { code: 'no_rate' };
  return null;
}

/** covering = working a position they don't hold */
export function isCover(m: StaffMember, positionId: string): boolean { return m.rates[positionId] == null; }
/** the rate a shift gets: the position's own rate, or their main rate when covering (rules: Positions and pay) */
export function rateFor(m: StaffMember, positionId: string): number | null {
  if (m.rates[positionId] != null) return m.rates[positionId];
  return m.mainPositionId && m.rates[m.mainPositionId] != null ? m.rates[m.mainPositionId] : null;
}
export function money(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }

// ── a day at a glance ──
export type DayStats = { slots: number; open: number; draft: number; pending: number; confirmed: number; declined: number };
export function dayStats(slots: Slot[]): DayStats {
  const live = slots.filter((s) => s.status !== 'cancelled');
  return {
    slots: live.length,
    open: live.filter((s) => !s.staffId).length,
    draft: live.filter((s) => s.staffId && s.confirm === 'draft').length,
    pending: live.filter((s) => s.staffId && s.confirm === 'pending').length,
    confirmed: live.filter((s) => s.staffId && s.confirm === 'ok').length,
    declined: live.filter((s) => !s.staffId && s.declinedBy).length,
  };
}
/** the one-line status of a day: what the manager most needs to do next */
export function dayStatus(st: DayStats): 'empty' | 'open' | 'unsent' | 'waiting' | 'staffed' {
  if (!st.slots) return 'empty';
  if (st.open) return 'open';
  if (st.draft) return 'unsent';
  if (st.pending) return 'waiting';
  return 'staffed';
}

/** server error codes the app shows as sentences (see apps/mobile/src/i18n) */
export const ERROR_CODES = ['no_access', 'not_found', 'started', 'not_staff', 'inactive', 'double_booked', 'no_rate', 'not_open', 'not_yours',
  'not_pending', 'past', 'bad_input', 'no_position', 'duplicate', 'invite_used', 'already_joined', 'pro_needed'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
/** pull our code out of a database error message ("double_booked") or a Postgres one */
export function errorCode(message: string | undefined | null): ErrorCode | 'unknown' {
  const m = (message ?? '').trim();
  return (ERROR_CODES as readonly string[]).includes(m) ? (m as ErrorCode) : m.includes('rate_cents_check') ? 'bad_input' : 'unknown';
}
