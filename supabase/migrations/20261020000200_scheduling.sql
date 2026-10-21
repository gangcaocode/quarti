-- Quarti scheduling functions. Every write to shifts, staff and access goes through these.
-- Errors are short codes (raise exception 'double_booked') that the app translates (apps/mobile/src/i18n).
-- Helpers live in the `private` schema (see 20261020000150_private_helpers.sql), which the API doesn't expose.

-- ── helpers ──
create or replace function private.need_manager(p_shop uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not private.is_manager(p_shop) then raise exception 'no_access'; end if;
end $$;

create or replace function private.tell(p_shop uuid, p_staff uuid, p_kind text, p_title text, p_body text, p_shift uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into public.updates (shop_id, staff_id, kind, title, body, shift_id) values (p_shop, p_staff, p_kind, p_title, coalesce(p_body, ''), p_shift)
$$;

-- "Tue Oct 13 · 17:00–23:00" in the shop's language-neutral form (the app formats dates itself; this is for the log)
create or replace function private.shift_label(p_day date, p_start int, p_end int) returns text
language sql immutable as $$
  select to_char(p_day, 'Dy Mon FMDD') || ' · ' || lpad((p_start / 60)::text, 2, '0') || ':' || lpad((p_start % 60)::text, 2, '0')
    || '–' || lpad(((p_end / 60) % 24)::text, 2, '0') || ':' || lpad((p_end % 60)::text, 2, '0')
$$;

-- an inactive worker with a return date is back on that day (rules: Staffing / "Coming back on")
create or replace function private.staff_is_active(p_staff uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare s public.staff;
begin
  select * into s from public.staff where id = p_staff;
  if s.id is null or s.removed_at is not null then return false; end if;
  if s.status <> 'inactive' then return true; end if;
  if s.back_on is not null and s.back_on <= private.shop_today(s.shop_id) then
    update public.staff set status = 'active', inactive_since = null, inactive_reason = null, back_on = null where id = s.id;
    perform private.tell(s.shop_id, s.id, 'back', 'Back from time away', 'You can be offered shifts again');
    return true;
  end if;
  return false;
end $$;

-- ── shops ──
create or replace function public.create_shop(p_name text, p_address text default '', p_timezone text default 'America/Toronto') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'no_access'; end if;
  if p_timezone not in (select name from pg_timezone_names) then raise exception 'bad_input'; end if;
  insert into public.shops (name, address, timezone, created_by) values (trim(p_name), coalesce(trim(p_address), ''), p_timezone, auth.uid()) returning id into v_id;
  insert into public.shop_plans (shop_id) values (v_id);
  insert into public.shop_access (shop_id, user_id, since) values (v_id, auth.uid(), private.shop_today(v_id));
  return v_id;
end $$;

-- a new restaurant in one step: the shop, its positions, its periods, and one of each position per period
-- p_periods: [{"name": "Lunch", "start_min": 660, "end_min": 900}, ...]
create or replace function public.setup_shop(p_name text, p_address text, p_positions text[], p_periods jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_shop uuid; x jsonb; v_per uuid; i int := 0;
begin
  if coalesce(array_length(p_positions, 1), 0) = 0 then raise exception 'no_position'; end if;
  if jsonb_typeof(p_periods) <> 'array' or jsonb_array_length(p_periods) = 0 then raise exception 'bad_input'; end if;
  v_shop := public.create_shop(p_name, p_address);
  insert into public.positions (shop_id, name, sort) select v_shop, trim(n), o from unnest(p_positions) with ordinality as u(n, o);
  for x in select * from jsonb_array_elements(p_periods) loop
    i := i + 1;
    insert into public.periods (shop_id, name, start_min, end_min, sort) values (v_shop, trim(x ->> 'name'), (x ->> 'start_min')::int, (x ->> 'end_min')::int, i) returning id into v_per;
    insert into public.period_staffing (period_id, position_id, n) select v_per, id, 1 from public.positions where shop_id = v_shop;
  end loop;
  return v_shop;
end $$;

-- the free plan has two service periods; a third is Pro (rules: Plan and access)
create or replace function public.periods_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.archived_at is null
     and (select tier from public.shop_plans where shop_id = new.shop_id) = 'free'
     and (select count(*) from public.periods where shop_id = new.shop_id and archived_at is null and id <> new.id) >= 2 then
    raise exception 'pro_needed';
  end if;
  return new;
end $$;
create trigger periods_limit before insert or update of archived_at on public.periods for each row execute function public.periods_limit();

-- the shops this person manages or works at
create or replace function public.my_shops() returns table (shop_id uuid, name text, manages boolean, staff_id uuid, until date)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, private.is_manager(s.id), private.my_staff_id(s.id),
         (select a.until from public.shop_access a where a.shop_id = s.id and a.user_id = auth.uid())
  from public.shops s
  where private.is_manager(s.id) or private.my_staff_id(s.id) is not null
  order by s.name
$$;

-- ── staff ──
-- p_positions: [{"position_id": "...", "rate_cents": 2100}, ...]; the first is the main position unless p_main is given
create or replace function public.create_staff(p_shop uuid, p_name text, p_email text, p_positions jsonb, p_main uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_staff uuid; v_token text; v_main uuid; x jsonb;
begin
  perform private.need_manager(p_shop);
  if jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then raise exception 'no_position'; end if;
  if nullif(trim(p_email), '') is not null and exists (select 1 from public.staff where shop_id = p_shop and removed_at is null and lower(email) = lower(trim(p_email))) then
    raise exception 'duplicate';
  end if;
  v_main := coalesce(p_main, (p_positions -> 0 ->> 'position_id')::uuid);
  insert into public.staff (shop_id, full_name, email, main_position_id) values (p_shop, trim(p_name), nullif(lower(trim(p_email)), ''), v_main) returning id into v_staff;
  for x in select * from jsonb_array_elements(p_positions) loop
    if not exists (select 1 from public.positions where id = (x ->> 'position_id')::uuid and shop_id = p_shop and archived_at is null) then raise exception 'bad_input'; end if;
    insert into public.staff_positions (staff_id, position_id, rate_cents) values (v_staff, (x ->> 'position_id')::uuid, (x ->> 'rate_cents')::int);
  end loop;
  if not exists (select 1 from public.staff_positions where staff_id = v_staff and position_id = v_main) then raise exception 'bad_input'; end if;
  insert into public.invites (shop_id, staff_id, created_by) values (p_shop, v_staff, auth.uid()) returning token into v_token;
  return jsonb_build_object('staff_id', v_staff, 'token', v_token);
end $$;

-- the person opens their invite link and signs in: their account becomes that staff row
create or replace function public.join_shop(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i public.invites; s public.staff;
begin
  if auth.uid() is null then raise exception 'no_access'; end if;
  select * into i from public.invites where token = upper(regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g')) for update;
  if i.token is null or i.used_at is not null then raise exception 'invite_used'; end if;
  select * into s from public.staff where id = i.staff_id for update;
  if s.removed_at is not null or s.user_id is not null then raise exception 'invite_used'; end if;
  if private.my_staff_id(i.shop_id) is not null then raise exception 'already_joined'; end if;
  update public.staff set user_id = auth.uid() where id = s.id;
  update public.invites set used_at = now(), used_by = auth.uid() where token = i.token;
  update public.profiles set full_name = s.full_name where id = auth.uid() and full_name = '';
  perform private.tell(i.shop_id, s.id, 'joined', 'You joined the team', '');
  return i.shop_id;
end $$;

-- positions and rates; a position taken away never cancels a shift: booked shifts in it are marked covering
create or replace function public.set_staff_positions(p_staff uuid, p_positions jsonb, p_main uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; x jsonb; v_main uuid;
begin
  select * into s from public.staff where id = p_staff and removed_at is null;
  if s.id is null then raise exception 'not_found'; end if;
  perform private.need_manager(s.shop_id);
  if jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then raise exception 'no_position'; end if;
  delete from public.staff_positions where staff_id = p_staff;
  for x in select * from jsonb_array_elements(p_positions) loop
    if not exists (select 1 from public.positions where id = (x ->> 'position_id')::uuid and shop_id = s.shop_id and archived_at is null) then raise exception 'bad_input'; end if;
    insert into public.staff_positions (staff_id, position_id, rate_cents) values (p_staff, (x ->> 'position_id')::uuid, (x ->> 'rate_cents')::int);
  end loop;
  v_main := coalesce(p_main, (p_positions -> 0 ->> 'position_id')::uuid);
  if not exists (select 1 from public.staff_positions where staff_id = p_staff and position_id = v_main) then raise exception 'bad_input'; end if;
  update public.staff set main_position_id = v_main where id = p_staff;
  update public.shifts sh set cover = not exists (select 1 from public.staff_positions sp where sp.staff_id = p_staff and sp.position_id = sh.position_id)
   where sh.staff_id = p_staff and sh.status = 'active' and sh.starts_at > public.app_now();   -- booked rates stay as they are
  perform private.tell(s.shop_id, p_staff, 'positions', 'Your positions and pay were updated', '');
end $$;

-- take someone off every shift that hasn't started; tell them about the ones they were asked for or accepted
create or replace function private.release_upcoming(p_staff uuid, p_why text) returns int
language plpgsql security definer set search_path = public as $$
declare r public.shifts; n int := 0;
begin
  for r in select * from public.shifts where staff_id = p_staff and status = 'active' and starts_at > public.app_now() for update loop
    if r.confirm in ('pending', 'ok') then perform private.tell(r.shop_id, p_staff, 'cancelled', 'Shift cancelled', private.shift_label(r.day, r.start_min, r.end_min) || ' · ' || p_why, r.id); end if;
    update public.shifts set staff_id = null, rate_cents = 0, cover = false, confirm = 'ok', declined_by = null where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.set_staff_status(p_staff uuid, p_active boolean, p_reason text default null, p_back_on date default null, p_unassign boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare s public.staff; n int := 0;
begin
  select * into s from public.staff where id = p_staff and removed_at is null;
  if s.id is null then raise exception 'not_found'; end if;
  perform private.need_manager(s.shop_id);
  if p_active then
    update public.staff set status = 'active', inactive_since = null, inactive_reason = null, back_on = null where id = p_staff;
    perform private.tell(s.shop_id, p_staff, 'active', 'Set as active', '');
  else
    if p_back_on is not null and p_back_on <= private.shop_today(s.shop_id) then raise exception 'bad_input'; end if;
    if p_unassign then n := private.release_upcoming(p_staff, 'Inactive'); end if;
    update public.staff set status = 'inactive', inactive_since = private.shop_today(s.shop_id), inactive_reason = nullif(trim(p_reason), ''), back_on = p_back_on where id = p_staff;
    perform private.tell(s.shop_id, p_staff, 'inactive', 'Set as inactive', '');   -- the reason stays with the manager
  end if;
  return n;
end $$;

create or replace function public.remove_staff(p_staff uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s public.staff; n int;
begin
  select * into s from public.staff where id = p_staff and removed_at is null;
  if s.id is null then raise exception 'not_found'; end if;
  perform private.need_manager(s.shop_id);
  n := private.release_upcoming(p_staff, 'Removed from the roster');
  update public.staff set removed_at = now() where id = p_staff;
  delete from public.invites where staff_id = p_staff and used_at is null;
  perform private.tell(s.shop_id, p_staff, 'removed', 'Removed from the roster', '');
  return n;
end $$;

-- ── the schedule ──
-- A day becomes real records the first time someone works on it: one open slot per needed person per period.
create or replace function public.plan_day(p_shop uuid, p_day date) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  perform private.need_manager(p_shop);
  if p_day < private.shop_today(p_shop) then raise exception 'past'; end if;
  insert into public.planned_days (shop_id, day) values (p_shop, p_day) on conflict do nothing;
  if not found then return 0; end if;
  insert into public.shifts (shop_id, day, position_id, period_id, start_min, end_min, starts_at, ends_at)
  select p_shop, p_day, ps.position_id, pe.id, pe.start_min, pe.end_min, now(), now()      -- the trigger sets the real instants
  from public.periods pe
  join public.period_staffing ps on ps.period_id = pe.id
  join public.positions po on po.id = ps.position_id and po.archived_at is null
  cross join lateral generate_series(1, ps.n) g
  where pe.shop_id = p_shop and pe.archived_at is null and ps.n > 0;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.add_slot(p_shop uuid, p_day date, p_position uuid, p_start int, p_end int, p_reason text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_period uuid;
begin
  perform private.need_manager(p_shop);
  perform public.plan_day(p_shop, p_day);
  if not exists (select 1 from public.positions where id = p_position and shop_id = p_shop and archived_at is null) then raise exception 'bad_input'; end if;
  -- the period it overlaps most, if any
  select id into v_period from public.periods
   where shop_id = p_shop and archived_at is null and start_min < p_end and p_start < end_min
   order by least(end_min, p_end) - greatest(start_min, p_start) desc, sort limit 1;
  insert into public.shifts (shop_id, day, position_id, period_id, start_min, end_min, starts_at, ends_at, extra, reason)
  values (p_shop, p_day, p_position, v_period, p_start, p_end, now(), now(), true, coalesce(trim(p_reason), '')) returning id into v_id;
  if (select starts_at from public.shifts where id = v_id) <= public.app_now() then raise exception 'started'; end if;
  return v_id;
end $$;

-- only an open slot that hasn't started can be removed
create or replace function public.remove_slot(p_shift uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.shifts;
begin
  select * into r from public.shifts where id = p_shift for update;
  if r.id is null then raise exception 'not_found'; end if;
  perform private.need_manager(r.shop_id);
  if r.starts_at <= public.app_now() then raise exception 'started'; end if;
  if r.staff_id is not null then raise exception 'not_open'; end if;
  delete from public.shifts where id = p_shift;
end $$;

-- put someone on a slot (as a draft: nobody is told until the manager sends)
create or replace function public.assign_shift(p_shift uuid, p_staff uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.shifts; s public.staff; v_rate int; v_cover boolean;
begin
  select * into r from public.shifts where id = p_shift for update;
  if r.id is null or r.status <> 'active' then raise exception 'not_found'; end if;
  perform private.need_manager(r.shop_id);
  if r.starts_at <= public.app_now() then raise exception 'started'; end if;
  select * into s from public.staff where id = p_staff and shop_id = r.shop_id;
  if s.id is null or s.removed_at is not null then raise exception 'not_staff'; end if;
  if not private.staff_is_active(p_staff) then raise exception 'inactive'; end if;
  if r.staff_id = p_staff then return; end if;
  select rate_cents into v_rate from public.staff_positions where staff_id = p_staff and position_id = r.position_id;
  v_cover := v_rate is null;
  if v_cover then   -- covering: paid their main position's rate (rules: Positions and pay)
    select rate_cents into v_rate from public.staff_positions where staff_id = p_staff and position_id = s.main_position_id;
  end if;
  if v_rate is null then raise exception 'no_rate'; end if;
  if r.staff_id is not null and r.confirm in ('pending', 'ok') then
    perform private.tell(r.shop_id, r.staff_id, 'cancelled', 'Shift cancelled', private.shift_label(r.day, r.start_min, r.end_min) || ' · given to someone else', r.id);
  end if;
  begin
    update public.shifts set staff_id = p_staff, rate_cents = v_rate, cover = v_cover, confirm = 'draft', declined_by = null, sent_at = null where id = p_shift;
  exception when exclusion_violation then raise exception 'double_booked';
  end;
end $$;

create or replace function public.unassign_shift(p_shift uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.shifts; told boolean := false;
begin
  select * into r from public.shifts where id = p_shift for update;
  if r.id is null or r.status <> 'active' then raise exception 'not_found'; end if;
  perform private.need_manager(r.shop_id);
  if r.starts_at <= public.app_now() then raise exception 'started'; end if;
  if r.staff_id is null then return false; end if;
  if r.confirm in ('pending', 'ok') then
    perform private.tell(r.shop_id, r.staff_id, 'cancelled', 'Shift cancelled', private.shift_label(r.day, r.start_min, r.end_min) || ' · removed from the schedule', r.id);
    told := true;
  end if;
  update public.shifts set staff_id = null, rate_cents = 0, cover = false, confirm = 'ok', declined_by = null, sent_at = null where id = p_shift;
  return told;
end $$;

-- send every draft in a date range: each worker is asked to confirm
create or replace function public.send_shifts(p_shop uuid, p_from date, p_to date) returns int
language plpgsql security definer set search_path = public as $$
declare r public.shifts; n int := 0;
begin
  perform private.need_manager(p_shop);
  if p_to < p_from or p_to - p_from > 62 then raise exception 'bad_input'; end if;
  for r in select * from public.shifts
           where shop_id = p_shop and day between p_from and p_to and status = 'active' and confirm = 'draft' and staff_id is not null and starts_at > public.app_now()
           order by starts_at for update loop
    update public.shifts set confirm = 'pending', sent_at = now() where id = r.id;
    perform private.tell(p_shop, r.staff_id, 'asked', 'New shift to confirm', private.shift_label(r.day, r.start_min, r.end_min), r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- the worker answers a shift they were asked for (no update to themselves: they just did it; the manager sees it on the schedule)
create or replace function public.reply_shift(p_shift uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.shifts; me uuid;
begin
  select * into r from public.shifts where id = p_shift for update;
  if r.id is null or r.status <> 'active' then raise exception 'not_found'; end if;
  me := private.my_staff_id(r.shop_id);
  if me is null or r.staff_id is distinct from me then raise exception 'not_yours'; end if;
  if r.confirm <> 'pending' then raise exception 'not_pending'; end if;
  if r.starts_at <= public.app_now() then raise exception 'started'; end if;
  if p_accept then
    update public.shifts set confirm = 'ok' where id = p_shift;
  else
    update public.shifts set staff_id = null, rate_cents = 0, cover = false, confirm = 'ok', declined_by = me, sent_at = null where id = p_shift;
  end if;
end $$;

-- ── who may call what ──
do $$
declare f text;
begin
  -- internal: only the functions below call these
  foreach f in array array[
    'private.need_manager(uuid)', 'private.tell(uuid,uuid,text,text,text,uuid)', 'private.staff_is_active(uuid)', 'private.release_upcoming(uuid,text)',
    'public.periods_limit()', 'public.handle_new_user()', 'public.shifts_stamp()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'create_shop(text,text,text)', 'setup_shop(text,text,text[],jsonb)', 'my_shops()', 'create_staff(uuid,text,text,jsonb,uuid)', 'join_shop(text)', 'set_staff_positions(uuid,jsonb,uuid)',
    'set_staff_status(uuid,boolean,text,date,boolean)', 'remove_staff(uuid)', 'plan_day(uuid,date)', 'add_slot(uuid,date,uuid,int,int,text)',
    'remove_slot(uuid)', 'assign_shift(uuid,uuid)', 'unassign_shift(uuid)', 'send_shifts(uuid,date,date)', 'reply_shift(uuid,boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
