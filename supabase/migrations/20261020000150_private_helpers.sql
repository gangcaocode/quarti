-- Keep the helper checks out of the public API, and replace the two views with functions.
-- Supabase's security check flags views that run with their creator's rights, and helper functions
-- anyone can call over the API. Row-level security policies keep working: they point at the
-- functions themselves, not at their schema.

create schema if not exists private;
grant usage on schema private to anon, authenticated;   -- policies run as the caller; the API never exposes this schema

-- the views go first: they depend on is_staff / is_manager
drop view if exists public.crew_shifts;
drop view if exists public.coworkers;

alter function public.is_manager(uuid)  set schema private;
alter function public.my_staff_id(uuid) set schema private;
alter function public.is_staff(uuid)    set schema private;
alter function public.shop_today(uuid)  set schema private;

-- is_staff calls my_staff_id by name: point it at the new place (same function, so policies keep it)
create or replace function private.is_staff(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.my_staff_id(p_shop) is not null
$$;

alter function public.app_now() set search_path = public;

-- who else works on a day: names, times and positions only, never pay or emails; confirmed shifts only
create or replace function public.crew_shifts(p_shop uuid, p_day date)
returns table (id uuid, day date, start_min int, end_min int, position_id uuid, staff_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select sh.id, sh.day, sh.start_min, sh.end_min, sh.position_id, sh.staff_id, st.full_name
  from public.shifts sh join public.staff st on st.id = sh.staff_id
  where sh.shop_id = p_shop and sh.day = p_day and sh.status = 'active' and sh.confirm = 'ok'
    and private.is_staff(p_shop)
  order by sh.start_min, st.full_name
$$;

-- the team, for the worker app: names only
create or replace function public.coworkers(p_shop uuid)
returns table (id uuid, full_name text, status text)
language sql stable security definer set search_path = public as $$
  select st.id, st.full_name, st.status
  from public.staff st
  where st.shop_id = p_shop and st.removed_at is null
    and (private.is_staff(p_shop) or private.is_manager(p_shop))
  order by st.full_name
$$;

revoke all on function public.crew_shifts(uuid, date), public.coworkers(uuid) from public, anon;
grant execute on function public.crew_shifts(uuid, date), public.coworkers(uuid) to authenticated;
