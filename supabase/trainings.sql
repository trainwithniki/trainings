-- Fit Body Center: live trainings and registrations.
-- Run after setup.sql in the separate Trainings Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  title text not null default 'Тренировка',
  location text not null default 'Fit Body Center',
  duration integer not null default 60 check (duration between 10 and 300),
  capacity integer not null default 25 check (capacity between 1 and 500),
  standard_capacity integer not null default 15 check (standard_capacity between 0 and 500),
  multisport_capacity integer not null default 10 check (multisport_capacity between 0 and 500),
  standard_available boolean not null default true,
  multisport_available boolean not null default true,
  booking_open_hours integer not null default 48 check (booking_open_hours between 0 and 720),
  status text not null default 'scheduled' check (status in ('scheduled','open','closed','completed')),
  registration_count integer not null default 0 check (registration_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.training_sessions
  add column if not exists booking_open_hours integer not null default 48
  check (booking_open_hours between 0 and 720);

alter table public.training_sessions
  add column if not exists standard_capacity integer not null default 15 check (standard_capacity between 0 and 500),
  add column if not exists multisport_capacity integer not null default 10 check (multisport_capacity between 0 and 500),
  add column if not exists standard_available boolean not null default true,
  add column if not exists multisport_available boolean not null default true;

update public.training_sessions
set capacity = standard_capacity + multisport_capacity;

create table if not exists public.training_registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  phone text not null check (char_length(regexp_replace(phone, '\D', '', 'g')) between 7 and 20),
  phone_normalized text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  tariff text not null default 'none' check (tariff in ('none','card8','card12','multisport')),
  booked_by text,
  cancellation_token uuid not null default gen_random_uuid(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists training_one_active_phone_per_session
  on public.training_registrations (session_id, phone_normalized)
  where cancelled_at is null;
create index if not exists training_sessions_date_idx
  on public.training_sessions (date, start_time);
create index if not exists training_registrations_session_idx
  on public.training_registrations (session_id, created_at);

alter table public.training_sessions enable row level security;
alter table public.training_registrations enable row level security;

create or replace function public.is_trainings_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('owner','admin','editor')
  )
$$;

revoke all on function public.is_trainings_admin() from public;
grant execute on function public.is_trainings_admin() to authenticated;

create or replace function public.can_access_training(training_title text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role in ('owner','admin','editor')
      and (
        p.role = 'owner'
        or p.training_access is null
        or exists (
          select 1 from unnest(p.training_access) allowed_title
          where lower(trim(allowed_title)) = lower(trim(training_title))
        )
      )
  )
$$;

revoke all on function public.can_access_training(text) from public;
grant execute on function public.can_access_training(text) to authenticated;

drop policy if exists "training sessions public read" on public.training_sessions;
create policy "training sessions public read"
on public.training_sessions for select
to anon, authenticated
using (true);

drop policy if exists "training sessions admin write" on public.training_sessions;
create policy "training sessions admin write"
on public.training_sessions for all
to authenticated
using (public.can_access_training(title))
with check (public.can_access_training(title));

drop policy if exists "training registrations admin read" on public.training_registrations;
create policy "training registrations admin read"
on public.training_registrations for select
to authenticated
using (exists (
  select 1 from public.training_sessions s
  where s.id = session_id and public.can_access_training(s.title)
));

drop policy if exists "training registrations admin write" on public.training_registrations;
create policy "training registrations admin write"
on public.training_registrations for all
to authenticated
using (exists (
  select 1 from public.training_sessions s
  where s.id = session_id and public.can_access_training(s.title)
))
with check (exists (
  select 1 from public.training_sessions s
  where s.id = session_id and public.can_access_training(s.title)
));

create or replace function public.refresh_training_registration_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.session_id, old.session_id);
  update public.training_sessions s
  set registration_count = counts.total_count,
      standard_available = counts.standard_count < s.standard_capacity,
      multisport_available = counts.multisport_count < s.multisport_capacity,
      updated_at = now()
  from (
    select count(*)::integer total_count,
      count(*) filter (where tariff in ('none','card8','card12'))::integer standard_count,
      count(*) filter (where tariff = 'multisport')::integer multisport_count
    from public.training_registrations
    where session_id = target_id and cancelled_at is null
  ) counts
  where s.id = target_id;

  if tg_op = 'UPDATE' and old.session_id is distinct from new.session_id then
    update public.training_sessions s
    set registration_count = counts.total_count,
        standard_available = counts.standard_count < s.standard_capacity,
        multisport_available = counts.multisport_count < s.multisport_capacity,
        updated_at = now()
    from (
      select count(*)::integer total_count,
        count(*) filter (where tariff in ('none','card8','card12'))::integer standard_count,
        count(*) filter (where tariff = 'multisport')::integer multisport_count
      from public.training_registrations
      where session_id = old.session_id and cancelled_at is null
    ) counts
    where s.id = old.session_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_training_count on public.training_registrations;
create trigger refresh_training_count
after insert or delete or update of cancelled_at, session_id, tariff
on public.training_registrations
for each row execute function public.refresh_training_registration_count();

create or replace function public.touch_training_session()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.capacity := new.standard_capacity + new.multisport_capacity;
  select count(*) filter (where tariff in ('none','card8','card12')) < new.standard_capacity,
         count(*) filter (where tariff = 'multisport') < new.multisport_capacity
  into new.standard_available, new.multisport_available
  from public.training_registrations
  where session_id = new.id and cancelled_at is null;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_training_session on public.training_sessions;
create trigger touch_training_session
before insert or update on public.training_sessions
for each row execute function public.touch_training_session();

-- Recalculate the two public availability flags for existing sessions.
update public.training_sessions
set standard_capacity = standard_capacity;

create or replace function public.book_training(
  p_session_id uuid,
  p_name text,
  p_phone text,
  p_tariff text,
  p_booked_by text default null
)
returns table (registration_id uuid, cancellation_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.training_sessions%rowtype;
  inserted public.training_registrations%rowtype;
  group_count integer;
begin
  if char_length(trim(p_name)) < 2 then raise exception 'Въведете име и фамилия.'; end if;
  if char_length(regexp_replace(p_phone, '\D', '', 'g')) < 7 then raise exception 'Въведете валиден телефон.'; end if;
  if p_tariff not in ('none','card8','card12','multisport') then raise exception 'Невалидна тарифа.'; end if;

  select * into target from public.training_sessions where id = p_session_id for update;
  if target.id is null then raise exception 'Тренировката не е намерена.'; end if;
  if target.status = 'closed' or target.status = 'completed' or (
    target.status <> 'open' and
    timezone('Europe/Sofia', now()) < (target.date + target.start_time) - make_interval(hours => target.booking_open_hours)
  ) then raise exception 'Записването за тази тренировка не е отворено.'; end if;
  if (target.date + target.start_time) <= timezone('Europe/Sofia', now()) then raise exception 'Тренировката вече е започнала.'; end if;
  if target.registration_count >= target.capacity then raise exception 'Няма свободни места.'; end if;

  if p_tariff = 'multisport' then
    select count(*)::integer into group_count from public.training_registrations
    where session_id = p_session_id and cancelled_at is null and tariff = 'multisport';
    if group_count >= target.multisport_capacity then raise exception 'Няма свободни места за MultiSport.'; end if;
  else
    select count(*)::integer into group_count from public.training_registrations
    where session_id = p_session_id and cancelled_at is null and tariff in ('none','card8','card12');
    if group_count >= target.standard_capacity then raise exception 'Няма свободни места за избрания начин на посещение.'; end if;
  end if;

  insert into public.training_registrations (session_id, name, phone, tariff, booked_by)
  values (p_session_id, trim(p_name), trim(p_phone), p_tariff, nullif(trim(p_booked_by), ''))
  returning * into inserted;

  return query select inserted.id, inserted.cancellation_token;
exception
  when unique_violation then
    raise exception 'Този телефон вече е записан за тренировката.';
end;
$$;

create or replace function public.cancel_training_registration(
  p_registration_id uuid,
  p_cancellation_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.training_registrations
  set cancelled_at = now()
  where id = p_registration_id
    and cancellation_token = p_cancellation_token
    and cancelled_at is null;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on table public.training_registrations from anon, public;
revoke select on table public.training_sessions from anon;
grant select (id,date,start_time,title,location,duration,capacity,booking_open_hours,status,registration_count,standard_available,multisport_available,created_at,updated_at)
on table public.training_sessions to anon;
grant select on table public.training_sessions to authenticated;
grant insert, update, delete on table public.training_sessions to authenticated;
grant select, insert, update, delete on table public.training_registrations to authenticated;
revoke all on function public.book_training(uuid,text,text,text,text) from public;
revoke all on function public.cancel_training_registration(uuid,uuid) from public;
grant execute on function public.book_training(uuid,text,text,text,text) to anon, authenticated;
grant execute on function public.cancel_training_registration(uuid,uuid) to anon, authenticated;

-- Editable quick-training templates, visible only to authorised administrators.
create table if not exists public.training_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 120),
  weekday integer not null check (weekday between 1 and 7),
  start_time time not null,
  location text not null default 'Fit Body Center',
  duration integer not null default 60 check (duration between 10 and 300),
  capacity integer not null default 25 check (capacity between 1 and 500),
  standard_capacity integer not null default 15 check (standard_capacity between 0 and 500),
  multisport_capacity integer not null default 10 check (multisport_capacity between 0 and 500),
  booking_open_hours integer not null default 48 check (booking_open_hours between 0 and 720),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.training_templates
  add column if not exists standard_capacity integer not null default 15 check (standard_capacity between 0 and 500),
  add column if not exists multisport_capacity integer not null default 10 check (multisport_capacity between 0 and 500);

update public.training_templates
set standard_capacity = 15, multisport_capacity = 10, capacity = 25
where capacity = 20 and standard_capacity = 15 and multisport_capacity = 10;

alter table public.training_templates enable row level security;
drop policy if exists "training templates admin access" on public.training_templates;
create policy "training templates admin access"
on public.training_templates for all
to authenticated
using (public.can_access_training(title))
with check (public.can_access_training(title));
grant select, insert, update, delete on table public.training_templates to authenticated;

create or replace function public.touch_training_template()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.capacity := new.standard_capacity + new.multisport_capacity;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists touch_training_template on public.training_templates;
create trigger touch_training_template before update on public.training_templates
for each row execute function public.touch_training_template();

insert into public.training_templates (title,weekday,start_time,sort_order)
select item.title,item.weekday,item.start_time::time,item.sort_order
from (values
  ('Пилатес',1,'07:45',0),('Body Training',1,'08:45',1),('Пилатес',1,'18:30',2),('Strong Body',1,'19:30',3),
  ('Body Balance',2,'08:00',4),('Зумба',2,'18:30',5),
  ('Body Training',3,'08:00',6),('Детска кондиционна',3,'17:30',7),('Пилатес',3,'18:30',8),('Tae Bo',3,'19:30',9),
  ('Body Balance',4,'08:00',10),('Зумба',4,'18:30',11),
  ('Пилатес',5,'07:45',12),('Body Training',5,'08:45',13),('Tae Bo',5,'19:00',14),
  ('Strong Body',6,'09:30',15),('Детска кондиционна',6,'10:30',16),('Кондиционен тим',7,'16:45',17)
) as item(title,weekday,start_time,sort_order)
where not exists (select 1 from public.training_templates);

-- Editable text displayed inside the public hero card.
create table if not exists public.site_content (
  id text primary key,
  hero_eyebrow text not null,
  hero_title text not null,
  hero_description text not null,
  hero_tags text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
drop policy if exists "site content public read" on public.site_content;
create policy "site content public read" on public.site_content for select to anon, authenticated using (true);
drop policy if exists "site content admin write" on public.site_content;
create policy "site content admin write" on public.site_content for all to authenticated
using (public.is_trainings_admin()) with check (public.is_trainings_admin());
grant select on table public.site_content to anon, authenticated;
grant insert, update, delete on table public.site_content to authenticated;
insert into public.site_content (id,hero_eyebrow,hero_title,hero_description,hero_tags)
values ('main','ТВОЕТО МЯСТО ЗА ДВИЖЕНИЕ',E'Сила. Баланс.\nДобро настроение.','Групови тренировки за всяко ниво в модерна и приятелска среда.','Pilates, Step Aerobics, Functional')
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'training_sessions'
  ) then
    alter publication supabase_realtime add table public.training_sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'training_registrations'
  ) then
    alter publication supabase_realtime add table public.training_registrations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'site_content'
  ) then
    alter publication supabase_realtime add table public.site_content;
  end if;
end $$;
