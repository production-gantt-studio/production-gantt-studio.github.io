-- Phase 1: organizations table. Mirrors the existing MySQL `organizations`
-- table (publicId/name/ownerId), translated to snake_case per Postgres/
-- Supabase convention.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  public_id text not null,
  name text not null,
  owner_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is
  'Phase 1 foundation table. Creation stays server-side (Edge Function / service_role) — see grants below.';

create unique index if not exists organizations_public_id_unique on public.organizations (public_id);
create index if not exists organizations_owner_id_idx on public.organizations (owner_id);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row
  execute function public.set_updated_at();

-- === RLS ===
alter table public.organizations enable row level security;

-- A user may read an organization only if they are a member of it (checked
-- against organization_members, created in the next migration). Defined here
-- as a forward-referencing policy is not possible in SQL, so this policy is
-- created in 20260821000003_organization_members.sql instead, once that table
-- exists. See that file for organizations_select_member.

-- === Grants ===
-- No INSERT/UPDATE/DELETE grants to anon/authenticated in Phase 1: the
-- existing tRPC server's ensureOrganizationForOwner() logic (auto-creating an
-- org on a user's first project) moves to a Phase 2 Edge Function running as
-- service_role, which bypasses RLS entirely. Client-side org creation is
-- intentionally not possible.
revoke all on public.organizations from anon;
revoke all on public.organizations from authenticated;
