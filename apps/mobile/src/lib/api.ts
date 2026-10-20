// Calls to the database functions (supabase/migrations/*_scheduling.sql). Every write goes through these;
// the server re-checks access and the rules each time, so a stale screen can never act.
import { errorCode, type ErrorCode } from '@quarti/rules';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(public code: ErrorCode | 'unknown' | 'network', message: string) { super(message); }
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const code = error.message?.includes('Failed to fetch') || error.message?.includes('Network') ? 'network' : errorCode(error.message);
    throw new ApiError(code, error.message);
  }
  return data as T;
}

export type MyShop = { shop_id: string; name: string; manages: boolean; staff_id: string | null; until: string | null };
export type PositionRate = { position_id: string; rate_cents: number };

export const api = {
  myShops: () => rpc<MyShop[]>('my_shops', {}),
  setupShop: (name: string, address: string, positions: string[], periods: { name: string; start_min: number; end_min: number }[]) =>
    rpc<string>('setup_shop', { p_name: name, p_address: address, p_positions: positions, p_periods: periods }),
  createStaff: (shop: string, name: string, email: string, positions: PositionRate[], main?: string) =>
    rpc<{ staff_id: string; token: string }>('create_staff', { p_shop: shop, p_name: name, p_email: email, p_positions: positions, p_main: main ?? null }),
  joinShop: (code: string) => rpc<string>('join_shop', { p_token: code }),
  setStaffPositions: (staff: string, positions: PositionRate[], main?: string) => rpc('set_staff_positions', { p_staff: staff, p_positions: positions, p_main: main ?? null }),
  setStaffStatus: (staff: string, active: boolean, reason?: string, backOn?: string | null, unassign = false) =>
    rpc<number>('set_staff_status', { p_staff: staff, p_active: active, p_reason: reason ?? null, p_back_on: backOn ?? null, p_unassign: unassign }),
  removeStaff: (staff: string) => rpc<number>('remove_staff', { p_staff: staff }),
  planDay: (shop: string, day: string) => rpc<number>('plan_day', { p_shop: shop, p_day: day }),
  addSlot: (shop: string, day: string, position: string, start: number, end: number, reason = '') =>
    rpc<string>('add_slot', { p_shop: shop, p_day: day, p_position: position, p_start: start, p_end: end, p_reason: reason }),
  removeSlot: (shift: string) => rpc('remove_slot', { p_shift: shift }),
  assign: (shift: string, staff: string) => rpc('assign_shift', { p_shift: shift, p_staff: staff }),
  unassign: (shift: string) => rpc<boolean>('unassign_shift', { p_shift: shift }),
  send: (shop: string, from: string, to: string) => rpc<number>('send_shifts', { p_shop: shop, p_from: from, p_to: to }),
  reply: (shift: string, accept: boolean) => rpc('reply_shift', { p_shift: shift, p_accept: accept }),
};
