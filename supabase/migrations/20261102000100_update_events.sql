-- Updates become events: a kind plus details, written out in each reader's language by the app
-- (rules: Languages, "Events, not sentences"). The server never writes sentences in a language, so adding
-- a language to the app needs nothing here. title and body stay as an English copy for older app versions.

alter table public.updates add column details jsonb not null default '{}'::jsonb;

-- any language the app ships (a BCP 47 code such as fr, en, zh, zh-Hant)
alter table public.profiles drop constraint profiles_lang_check;
alter table public.profiles add constraint profiles_lang_check check (lang ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$');

-- details: whatever the caller gives, plus the shift's day and times when the update is about a shift
drop function private.tell(uuid, uuid, text, text, text, uuid);
create function private.tell(p_shop uuid, p_staff uuid, p_kind text, p_title text, p_body text, p_shift uuid default null, p_details jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into public.updates (shop_id, staff_id, kind, title, body, shift_id, details)
  values (p_shop, p_staff, p_kind, p_title, coalesce(p_body, ''), p_shift,
          coalesce(p_details, '{}') || coalesce((select jsonb_build_object('day', day, 'start_min', start_min, 'end_min', end_min) from public.shifts where id = p_shift), '{}'))
$$;
revoke all on function private.tell(uuid, uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;

-- why a shift was taken away, as a code the app translates: given_away, unassigned, inactive, removed
create or replace function private.release_upcoming(p_staff uuid, p_why text) returns int
language plpgsql security definer set search_path = public as $$
declare r public.shifts; n int := 0;
begin
  for r in select * from public.shifts where staff_id = p_staff and status = 'active' and starts_at > public.app_now() for update loop
    if r.confirm in ('pending', 'ok') then
      perform private.tell(r.shop_id, p_staff, 'cancelled', 'Shift cancelled',
        private.shift_label(r.day, r.start_min, r.end_min) || ' · ' || case p_why when 'inactive' then 'Inactive' else 'Removed from the roster' end,
        r.id, jsonb_build_object('why', p_why));
    end if;
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
    if p_unassign then n := private.release_upcoming(p_staff, 'inactive'); end if;
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
  n := private.release_upcoming(p_staff, 'removed');
  update public.staff set removed_at = now() where id = p_staff;
  delete from public.invites where staff_id = p_staff and used_at is null;
  perform private.tell(s.shop_id, p_staff, 'removed', 'Removed from the roster', '');
  return n;
end $$;

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
    perform private.tell(r.shop_id, r.staff_id, 'cancelled', 'Shift cancelled', private.shift_label(r.day, r.start_min, r.end_min) || ' · given to someone else', r.id,
      '{"why": "given_away"}');
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
    perform private.tell(r.shop_id, r.staff_id, 'cancelled', 'Shift cancelled', private.shift_label(r.day, r.start_min, r.end_min) || ' · removed from the schedule', r.id,
      '{"why": "unassigned"}');
    told := true;
  end if;
  update public.shifts set staff_id = null, rate_cents = 0, cover = false, confirm = 'ok', declined_by = null, sent_at = null where id = p_shift;
  return told;
end $$;
