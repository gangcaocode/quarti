// Reading a shop's data. Row-level security decides what comes back: a worker asking for staff gets only their own row.
import type { Day, Period, Slot, StaffMember } from '@quarti/rules';
import { supabase } from './supabase';

export type Position = { id: string; name: string; sort: number };
export type Staffing = { period_id: string; position_id: string; n: number };
export type Setup = { positions: Position[]; periods: Period[]; staffing: Staffing[] };
export type StaffRow = StaffMember & { email: string | null; joined: boolean; inactiveReason: string | null };
export type Shift = Slot & { rateCents: number; cover: boolean; extra: boolean; reason: string; startsAt: string };
export type Update = { id: number; kind: string; title: string; body: string; created_at: string; seen_at: string | null };

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function loadSetup(shop: string): Promise<Setup> {
  const [pos, per] = await Promise.all([
    supabase.from('positions').select('id, name, sort').eq('shop_id', shop).is('archived_at', null).order('sort'),
    supabase.from('periods').select('id, name, start_min, end_min, sort').eq('shop_id', shop).is('archived_at', null).order('sort'),
  ]);
  const periods = must(per).map((p) => ({ id: p.id, name: p.name, startMin: p.start_min, endMin: p.end_min, sort: p.sort }));
  const staffing = periods.length ? must(await supabase.from('period_staffing').select('period_id, position_id, n').in('period_id', periods.map((p) => p.id))) : [];
  return { positions: must(pos), periods, staffing };
}

export async function loadStaff(shop: string): Promise<StaffRow[]> {
  const rows = must(await supabase.from('staff').select('id, full_name, email, status, back_on, inactive_reason, main_position_id, user_id, removed_at, staff_positions(position_id, rate_cents)')
    .eq('shop_id', shop).is('removed_at', null).order('full_name'));
  return rows.map((r: any) => ({
    id: r.id, fullName: r.full_name, email: r.email, status: r.status, backOn: r.back_on, inactiveReason: r.inactive_reason,
    mainPositionId: r.main_position_id, joined: !!r.user_id, removed: !!r.removed_at,
    rates: Object.fromEntries((r.staff_positions ?? []).map((x: any) => [x.position_id, x.rate_cents])),
  }));
}

const toShift = (r: any): Shift => ({
  id: r.id, day: r.day, positionId: r.position_id, periodId: r.period_id, startMin: r.start_min, endMin: r.end_min, staffId: r.staff_id,
  confirm: r.confirm, status: r.status, declinedBy: r.declined_by, rateCents: r.rate_cents, cover: r.cover, extra: r.extra, reason: r.reason, startsAt: r.starts_at,
});
const SHIFT_COLS = 'id, day, position_id, period_id, start_min, end_min, staff_id, confirm, status, declined_by, rate_cents, cover, extra, reason, starts_at';

export async function loadShifts(shop: string, from: Day, to: Day): Promise<Shift[]> {
  return must(await supabase.from('shifts').select(SHIFT_COLS).eq('shop_id', shop).eq('status', 'active').gte('day', from).lte('day', to).order('starts_at')).map(toShift);
}
export async function loadPlanned(shop: string, from: Day, to: Day): Promise<Set<Day>> {
  return new Set(must(await supabase.from('planned_days').select('day').eq('shop_id', shop).gte('day', from).lte('day', to)).map((r) => r.day));
}
/** a worker's own shifts (the server only returns theirs, once sent) */
export async function loadMyShifts(shop: string, from: Day): Promise<Shift[]> {
  return must(await supabase.from('shifts').select(SHIFT_COLS).eq('shop_id', shop).eq('status', 'active').gte('day', from).order('starts_at').limit(60)).map(toShift);
}
export async function loadCrew(shop: string, day: Day): Promise<{ id: string; staff_id: string; full_name: string; start_min: number; end_min: number; position_id: string }[]> {
  return must(await supabase.rpc('crew_shifts', { p_shop: shop, p_day: day }));
}
export async function loadUpdates(staff: string): Promise<Update[]> {
  return must(await supabase.from('updates').select('id, kind, title, body, created_at, seen_at').eq('staff_id', staff).order('id', { ascending: false }).limit(30));
}
export async function markSeen(staff: string) {
  await supabase.from('updates').update({ seen_at: new Date().toISOString() }).eq('staff_id', staff).is('seen_at', null);
}
