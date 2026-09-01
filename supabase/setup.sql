-- Fit Body Center / Trainings: authentication, roles and user invitations.
-- Run this file in the NEW Supabase project's SQL Editor.

create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  display_name text,
  role text not null default 'editor' check (role in ('owner','admin','editor')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists training_access text[];

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  display_name text,
  -- "owner" is used only for the one-time bootstrap invite created directly
  -- in Supabase. The admin RPC below can still invite only admin/editor roles.
  role text not null default 'editor' check (role in ('owner','admin','editor')),
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_invites
  add column if not exists training_access text[];

alter table public.profiles enable row level security;
alter table public.user_invites enable row level security;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = auth.uid() and active = true
$$;

revoke all on function public.current_admin_role() from public;
grant execute on function public.current_admin_role() to authenticated;

create or replace function public.is_trainings_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role = 'owner'
      and lower(email::text) = 'svetlichaa@gmail.com'
  )
$$;

revoke all on function public.is_trainings_owner() from public;
grant execute on function public.is_trainings_owner() to authenticated;

drop policy if exists "profile_self_or_admin_read" on public.profiles;
create policy "profile_self_or_admin_read"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_trainings_owner());

drop policy if exists "admin_invites_read" on public.user_invites;
create policy "admin_invites_read"
on public.user_invites for select
to authenticated
using (public.is_trainings_owner());

create or replace function public.handle_new_training_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.user_invites%rowtype;
begin
  select * into pending
  from public.user_invites
  where lower(email::text) = lower(new.email)
  limit 1;

  insert into public.profiles (id, email, display_name, role, active, training_access)
  values (
    new.id,
    new.email,
    coalesce(pending.display_name, new.raw_user_meta_data->>'display_name'),
    coalesce(pending.role, 'editor'),
    pending.id is not null,
    pending.training_access
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    training_access = coalesce(excluded.training_access, public.profiles.training_access),
    updated_at = now();

  if pending.id is not null then
    update public.user_invites set accepted_at = now() where id = pending.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_training_user_created on auth.users;
create trigger on_training_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_training_user();

drop function if exists public.admin_invite_user(text,text,text);
create or replace function public.admin_invite_user(
  invite_email text,
  invite_name text default null,
  invite_role text default 'editor',
  invite_training_access text[] default array[]::text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_id uuid;
  existing_user uuid;
begin
  if not public.is_trainings_owner() then
    raise exception 'Нямате право да добавяте потребители.';
  end if;
  if invite_role not in ('admin','editor') then
    raise exception 'Невалидна роля.';
  end if;
  if coalesce(array_length(invite_training_access, 1), 0) = 0 then
    raise exception 'Изберете поне една тренировка.';
  end if;

  insert into public.user_invites (email, display_name, role, invited_by, accepted_at, training_access)
  values (lower(trim(invite_email)), nullif(trim(invite_name),''), invite_role, auth.uid(), null, invite_training_access)
  on conflict (email) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    invited_by = auth.uid(),
    training_access = excluded.training_access,
    accepted_at = null,
    created_at = now()
  returning id into invite_id;

  select id into existing_user from auth.users where lower(email) = lower(trim(invite_email)) limit 1;
  if existing_user is not null then
    update public.profiles set
      display_name = coalesce(nullif(trim(invite_name),''), display_name),
      role = invite_role,
      training_access = invite_training_access,
      active = true,
      updated_at = now()
    where id = existing_user;
    update public.user_invites set accepted_at = now() where id = invite_id;
  end if;
  return invite_id;
end;
$$;

create or replace function public.owner_set_training_access(
  target_user_id uuid,
  next_training_access text[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_trainings_owner() then
    raise exception 'Нямате право да променяте достъпа до тренировки.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'Owner профилът винаги има пълен достъп.';
  end if;
  if coalesce(array_length(next_training_access, 1), 0) = 0 then
    raise exception 'Изберете поне една тренировка.';
  end if;
  update public.profiles
  set training_access = next_training_access, updated_at = now()
  where id = target_user_id and role <> 'owner';
  return found;
end;
$$;

create or replace function public.owner_update_profile_name(
  target_user_id uuid,
  next_display_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_trainings_owner() then
    raise exception 'Нямате право да редактирате профили.';
  end if;
  if char_length(trim(next_display_name)) not between 2 and 120 then
    raise exception 'Името трябва да бъде между 2 и 120 символа.';
  end if;
  update public.profiles
  set display_name = trim(next_display_name), updated_at = now()
  where id = target_user_id;
  return found;
end;
$$;

create or replace function public.admin_set_user_access(
  target_user_id uuid,
  next_role text,
  next_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_trainings_owner() then
    raise exception 'Нямате право да променяте потребители.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'Не можете да променяте собствения си достъп.';
  end if;
  if next_role not in ('admin','editor') then raise exception 'Невалидна роля.'; end if;
  update public.profiles set role = next_role, active = next_active, updated_at = now() where id = target_user_id;
end;
$$;

create or replace function public.owner_delete_training_invite(invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if not public.is_trainings_owner() then
    raise exception 'Нямате право да изтривате покани.';
  end if;
  delete from public.user_invites where id = invite_id and accepted_at is null;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

create or replace function public.owner_delete_training_profile(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
  deleted_count integer;
begin
  if not public.is_trainings_owner() then
    raise exception 'Нямате право да изтривате профили.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'Не можете да изтриете собствения си owner профил.';
  end if;

  select email::text into target_email
  from public.profiles
  where id = target_user_id and role <> 'owner';

  if target_email is null then
    raise exception 'Профилът не съществува или е защитен.';
  end if;

  delete from auth.users where id = target_user_id;
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.admin_invite_user(text,text,text,text[]) from public;
revoke all on function public.admin_set_user_access(uuid,text,boolean) from public;
revoke all on function public.owner_delete_training_invite(uuid) from public;
revoke all on function public.owner_delete_training_profile(uuid) from public;
revoke all on function public.owner_set_training_access(uuid,text[]) from public;
revoke all on function public.owner_update_profile_name(uuid,text) from public;
grant execute on function public.admin_invite_user(text,text,text,text[]) to authenticated;
grant execute on function public.admin_set_user_access(uuid,text,boolean) to authenticated;
grant execute on function public.owner_delete_training_invite(uuid) to authenticated;
grant execute on function public.owner_delete_training_profile(uuid) to authenticated;
grant execute on function public.owner_set_training_access(uuid,text[]) to authenticated;
grant execute on function public.owner_update_profile_name(uuid,text) to authenticated;

-- Backup history is written by the protected scheduled job and is visible
-- only to the single Trainings owner account.
create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  status text not null default 'success' check (status in ('success','failed')),
  file_size bigint check (file_size is null or file_size >= 0),
  created_at timestamptz not null default now()
);

alter table public.backup_runs enable row level security;
drop policy if exists "backup runs owner read" on public.backup_runs;
create policy "backup runs owner read"
on public.backup_runs for select
to authenticated
using (public.is_trainings_owner());
revoke all on table public.backup_runs from anon, public;
grant select on table public.backup_runs to authenticated;
create index if not exists backup_runs_created_at_idx
on public.backup_runs (created_at desc);

-- The single owner account for this project is restricted by
-- public.is_trainings_owner(). Other roles can read only their own profile.
