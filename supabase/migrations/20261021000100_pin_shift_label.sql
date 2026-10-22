-- Supabase's security check: give shift_label a fixed search path like every other function.
alter function private.shift_label(date, int, int) set search_path = public;
