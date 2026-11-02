-- Managers edit a shop's setup with plain table updates (the Shop screen). Limit those updates to the
-- columns the app edits, so a row can't be moved to another shop: moving a period in from a second shop
-- got around the free plan's two periods, and a moved position mixed two shops' schedules.
-- The time zone stays editable, but only to a real one, and shifts that haven't started keep their clock times.

revoke update on public.shops, public.periods, public.positions from anon, authenticated;
grant update (name, address, timezone, notice_hours)          on public.shops     to authenticated;
grant update (name, start_min, end_min, sort, archived_at)    on public.periods   to authenticated;
grant update (name, sort, archived_at)                        on public.positions to authenticated;

-- the period limit also checks a change of shop, should a server function ever make one
drop trigger periods_limit on public.periods;
create trigger periods_limit before insert or update of archived_at, shop_id on public.periods for each row execute function public.periods_limit();

create or replace function private.shop_timezone_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.timezone not in (select name from pg_timezone_names) then raise exception 'bad_input'; end if;
  return new;
end $$;
create trigger shop_timezone_check before insert or update of timezone on public.shops
  for each row execute function private.shop_timezone_check();

-- a shift at 17:00 stays at 17:00 in the new time zone; started shifts are never touched (rules: Started shifts are protected).
-- Shifts move one at a time and the double-booking check runs on each, so go in the direction of the move:
-- back-to-back shifts never overlap halfway through.
create or replace function private.shop_timezone_moved() returns trigger
language plpgsql security definer set search_path = public as $$
declare later boolean; r record;
begin
  later := (now()::timestamp at time zone new.timezone) > (now()::timestamp at time zone old.timezone);
  for r in select id from public.shifts
           where shop_id = new.id and status = 'active' and starts_at > public.app_now()
           order by case when later then starts_at end desc, starts_at loop
    begin
      update public.shifts set start_min = start_min where id = r.id;   -- the stamp trigger recomputes starts_at / ends_at
    exception when exclusion_violation then raise exception 'double_booked';
    end;
  end loop;
  return null;
end $$;
create trigger shop_timezone_moved after update of timezone on public.shops
  for each row when (new.timezone is distinct from old.timezone) execute function private.shop_timezone_moved();

revoke all on function private.shop_timezone_check(), private.shop_timezone_moved() from public, anon, authenticated;
