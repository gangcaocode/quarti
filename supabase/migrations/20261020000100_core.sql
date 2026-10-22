-- Quarti core schema: shops, access, positions, periods, staff, shifts, updates.
-- Spec: docs/rules.md. Every rule that matters is enforced here, not only in the app:
-- a phone can show a screen the person no longer has rights to (see "Every tap re-checks access").

-- extensions go in their own schema, as on Supabase (where pgcrypto already lives in `extensions`)
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ── time ──
-- app_now(): the current time. Tests pin it with `set app.now = '…'`; production never sets it.
create or replace function public.app_now() returns timestamptz
language sql stable as $$
  select coalesce(nullif(current_setting('app.now', true), '')::timestamptz, now())
$$;

-- ── people ──
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (length(full_name) <= 80),
  lang        text check (lang in ('fr', 'en')),   -- null until the app saves the language the person uses
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── shops and who can manage them ──
create table public.shops (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 60),
  address       text not null default '' check (length(address) <= 160),
  region        text not null default 'CA-QC',
  timezone      text not null default 'America/Toronto',
  notice_hours  int  not null default 24 check (notice_hours in (12, 24, 48, 72)),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

-- Free: one person manages, 2 periods. Pro: share access, 3rd period, owner mode (rules: Plan and access).
create table public.shop_plans (
  shop_id  uuid primary key references public.shops (id) on delete cascade,
  tier     text not null default 'free' check (tier in ('free', 'pro')),
  payer    uuid references auth.users (id),
  since    date not null default current_date
);

-- Everyone with access has the same rights. `until` makes it a stand-in; the payer never expires.
create table public.shop_access (
  shop_id  uuid not null references public.shops (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  since    date not null default current_date,
  until    date,
  primary key (shop_id, user_id)
);

create or replace function public.shop_today(p_shop uuid) returns date
language sql stable security definer set search_path = public as $$
  select (public.app_now() at time zone s.timezone)::date from public.shops s where s.id = p_shop
$$;

-- The one access check. Called by every policy and every manager function, at the moment of the request.
create or replace function public.is_manager(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shop_access a join public.shops s on s.id = a.shop_id
    where a.shop_id = p_shop and a.user_id = auth.uid()
      and (a.until is null or a.until >= (public.app_now() at time zone s.timezone)::date)
  )
$$;

-- ── what the shop is made of ──
create table public.positions (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 40 and name !~ '["<>\\`|]'),
  sort        int  not null default 0,
  archived_at timestamptz
);
create unique index positions_name_live on public.positions (shop_id, lower(trim(name))) where archived_at is null;

create table public.periods (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 30),
  start_min   int  not null check (start_min between 0 and 1439),
  end_min     int  not null,
  sort        int  not null default 0,
  archived_at timestamptz,
  check (end_min > start_min and end_min - start_min between 60 and 960)
);

-- usual staffing: how many of each position a period needs
create table public.period_staffing (
  period_id   uuid not null references public.periods (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  n           int  not null default 1 check (n between 0 and 20),
  primary key (period_id, position_id)
);

-- ── staff ──
-- A staff row exists before the person has an account (invited by name/email); user_id is set when they join.
create table public.staff (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete set null,
  full_name        text not null check (length(trim(full_name)) between 1 and 80),
  email            text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status           text not null default 'new' check (status in ('new', 'active', 'inactive')),
  inactive_since   date,
  inactive_reason  text check (length(inactive_reason) <= 80),
  back_on          date,
  main_position_id uuid references public.positions (id),
  removed_at       timestamptz,
  created_at       timestamptz not null default now()
);
create unique index staff_user_live on public.staff (shop_id, user_id) where user_id is not null and removed_at is null;

-- the positions someone holds, each with its own hourly rate (rules: Positions and pay per worker)
create table public.staff_positions (
  staff_id    uuid not null references public.staff (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  rate_cents  int  not null check (rate_cents between 1500 and 6000),
  primary key (staff_id, position_id)
);

-- invite codes people can type: 10 characters, no look-alikes (0/O, 1/I/L)
create or replace function public.invite_code() returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '' order by i)
  from (select extensions.gen_random_bytes(10) as b) x, generate_series(0, 9) i
$$;

create table public.invites (
  token      text primary key default public.invite_code(),
  shop_id    uuid not null references public.shops (id) on delete cascade,
  staff_id   uuid not null references public.staff (id) on delete cascade,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  used_by    uuid references auth.users (id)
);

-- my staff row in a shop (the worker side of every check)
create or replace function public.my_staff_id(p_shop uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.staff where shop_id = p_shop and user_id = auth.uid() and removed_at is null
$$;
create or replace function public.is_staff(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_staff_id(p_shop) is not null
$$;

-- ── the schedule ──
-- A day is "planned" once it has real slot records; before that the app shows the usual staffing as a preview.
create table public.planned_days (
  shop_id uuid not null references public.shops (id) on delete cascade,
  day     date not null,
  primary key (shop_id, day)
);

-- One row per slot. Times are minutes on the shift's own day (end can pass midnight: 22:00–02:00 = 1320–1560).
-- starts_at/ends_at are the real instants in the shop's time zone, kept by a trigger.
create table public.shifts (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops (id) on delete cascade,
  day          date not null,
  position_id  uuid not null references public.positions (id),
  period_id    uuid references public.periods (id),
  start_min    int  not null check (start_min between 0 and 1439),
  end_min      int  not null,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  staff_id     uuid references public.staff (id),
  rate_cents   int  not null default 0 check (rate_cents >= 0),
  cover        boolean not null default false,             -- worked by someone who doesn't hold the position
  confirm      text not null default 'ok' check (confirm in ('ok', 'draft', 'pending')),
  status       text not null default 'active' check (status in ('active', 'cancelled')),
  extra        boolean not null default false,
  reason       text not null default '' check (length(reason) <= 80),
  declined_by  uuid references public.staff (id),
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_min > start_min and end_min - start_min between 30 and 960),
  check (staff_id is not null or (confirm = 'ok' and rate_cents = 0 and not cover)),
  -- nobody is ever booked twice at the same time, however many managers act at once
  constraint shifts_no_double_booking exclude using gist (staff_id with =, tstzrange(starts_at, ends_at) with &&)
    where (staff_id is not null and status = 'active')
);
create index shifts_shop_day on public.shifts (shop_id, day);
create index shifts_staff on public.shifts (staff_id, starts_at) where staff_id is not null;

create or replace function public.shifts_stamp() returns trigger
language plpgsql set search_path = public as $$
declare tz text;
begin
  select timezone into tz from public.shops where id = new.shop_id;
  new.starts_at := ((new.day::timestamp + make_interval(mins => new.start_min)) at time zone tz);
  new.ends_at   := ((new.day::timestamp + make_interval(mins => new.end_min)) at time zone tz);
  new.updated_at := now();
  return new;
end $$;
create trigger shifts_stamp before insert or update of day, start_min, end_min, shop_id, staff_id, confirm, status on public.shifts
  for each row execute function public.shifts_stamp();

-- What a worker is told: a log per staff row. Workers always see changes as coming from "the manager".
create table public.updates (
  id         bigint generated always as identity primary key,
  shop_id    uuid not null references public.shops (id) on delete cascade,
  staff_id   uuid not null references public.staff (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  shift_id   uuid references public.shifts (id) on delete set null,
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create index updates_staff on public.updates (staff_id, created_at desc);

-- ── row-level security ──
alter table public.profiles        enable row level security;
alter table public.shops           enable row level security;
alter table public.shop_plans      enable row level security;
alter table public.shop_access     enable row level security;
alter table public.positions       enable row level security;
alter table public.periods         enable row level security;
alter table public.period_staffing enable row level security;
alter table public.staff           enable row level security;
alter table public.staff_positions enable row level security;
alter table public.invites         enable row level security;
alter table public.planned_days    enable row level security;
alter table public.shifts          enable row level security;
alter table public.updates         enable row level security;

create policy profiles_self on public.profiles for select using (id = auth.uid());
create policy profiles_self_upd on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy shops_read on public.shops for select using (public.is_manager(id) or public.is_staff(id));
create policy shops_edit on public.shops for update using (public.is_manager(id)) with check (public.is_manager(id));

create policy plans_read on public.shop_plans for select using (public.is_manager(shop_id));
create policy access_read on public.shop_access for select using (public.is_manager(shop_id) or user_id = auth.uid());

-- the shop's setup: managers edit; staff can read it (positions and periods name their shifts)
create policy positions_read on public.positions for select using (public.is_manager(shop_id) or public.is_staff(shop_id));
create policy positions_add  on public.positions for insert with check (public.is_manager(shop_id));
create policy positions_edit on public.positions for update using (public.is_manager(shop_id)) with check (public.is_manager(shop_id));
create policy periods_read on public.periods for select using (public.is_manager(shop_id) or public.is_staff(shop_id));
create policy periods_add  on public.periods for insert with check (public.is_manager(shop_id));
create policy periods_edit on public.periods for update using (public.is_manager(shop_id)) with check (public.is_manager(shop_id));
create policy staffing_read on public.period_staffing for select using (exists (select 1 from public.periods p where p.id = period_id and (public.is_manager(p.shop_id) or public.is_staff(p.shop_id))));
create policy staffing_write on public.period_staffing for all
  using (exists (select 1 from public.periods p where p.id = period_id and public.is_manager(p.shop_id)))
  with check (exists (select 1 from public.periods p join public.positions q on q.id = position_id and q.shop_id = p.shop_id where p.id = period_id and public.is_manager(p.shop_id)));

-- staff: the manager sees everyone; a worker sees their own row (coworkers come through the crew view, without emails)
create policy staff_read on public.staff for select using (public.is_manager(shop_id) or user_id = auth.uid());
create policy staffpos_read on public.staff_positions for select using (exists (select 1 from public.staff s where s.id = staff_id and (public.is_manager(s.shop_id) or s.user_id = auth.uid())));

create policy invites_read on public.invites for select using (public.is_manager(shop_id));
create policy planned_read on public.planned_days for select using (public.is_manager(shop_id) or public.is_staff(shop_id));

-- shifts: managers see all; a worker sees their own once sent (drafts are the manager's work in progress)
create policy shifts_read on public.shifts for select using (
  public.is_manager(shop_id)
  or (staff_id is not null and staff_id = public.my_staff_id(shop_id) and confirm <> 'draft')
);

create policy updates_read on public.updates for select using (exists (select 1 from public.staff s where s.id = staff_id and s.user_id = auth.uid()));
create policy updates_seen on public.updates for update using (exists (select 1 from public.staff s where s.id = staff_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.staff s where s.id = staff_id and s.user_id = auth.uid()));

-- who else works a shift: names only, never rates or emails, confirmed shifts only
create view public.crew_shifts with (security_barrier = true) as
  select sh.id, sh.shop_id, sh.day, sh.start_min, sh.end_min, sh.starts_at, sh.ends_at, sh.position_id, sh.staff_id, st.full_name
  from public.shifts sh join public.staff st on st.id = sh.staff_id
  where sh.status = 'active' and sh.confirm = 'ok' and public.is_staff(sh.shop_id);

-- coworkers: names for the worker app (team list, swaps later)
create view public.coworkers with (security_barrier = true) as
  select st.id, st.shop_id, st.full_name, st.status
  from public.staff st
  where st.removed_at is null and (public.is_staff(st.shop_id) or public.is_manager(st.shop_id));

-- writes to shifts, staff, access and plans go through the functions in the next migration only
revoke insert, update, delete on public.shifts, public.staff, public.staff_positions, public.shop_access, public.shop_plans, public.invites, public.planned_days, public.updates from anon, authenticated;
grant update (seen_at) on public.updates to authenticated;
grant select on public.crew_shifts, public.coworkers to authenticated;
revoke all on public.crew_shifts, public.coworkers from anon;
