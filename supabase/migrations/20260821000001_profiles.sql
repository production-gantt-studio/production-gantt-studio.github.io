-- Phase 1: profiles table, linked 1:1 to Supabase Auth's own auth.users.
-- Scope: schema + RLS + grants only. No application code reads/writes this
-- table yet (existing Manus-based auth flow is untouched in Phase 1).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  -- Global admin flag: mirrors the original MySQL users.role ("user" | "admin").
  -- Controls project-creation rights, same as the existing tRPC server.
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Phase 1 foundation table. Not yet wired into the client (main.tsx/useAuth still use the existing Manus OAuth flow).';
comment on column public.profiles.role is
  'Global role. Only ever set by a service-role process (Edge Function). Clients cannot change their own role — see the column-level REVOKE below.';

create index if not exists profiles_role_idx on public.profiles (role);

-- Keep updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Auto-create a profiles row whenever a new Supabase Auth user is created.
-- SECURITY DEFINER: runs with the privileges of the function owner (not the
-- calling user), because the trigger fires on auth.users which the calling
-- session cannot otherwise write around RLS.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- === RLS ===
alter table public.profiles enable row level security;

-- Users may read only their own profile in Phase 1. Cross-member visibility
-- (e.g. showing an org-mate's display name) is a Phase 2 concern once the
-- member-list UI is actually wired up.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- Users may update their own profile row (e.g. full_name), but never their
-- own role — enforced below via column-level REVOKE, not just this policy,
-- because RLS alone is row-level and cannot restrict individual columns.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No client-side INSERT/DELETE: rows are created only by the trigger above
-- and removed only via auth.users cascade.

-- === Grants ===
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;
-- Self-escalation guard: even though the UPDATE policy above allows updating
-- one's own row, explicitly block the "role" column at the grant level so a
-- member can never set themselves to admin, regardless of any future policy
-- change.
revoke update (role) on public.profiles from authenticated;
