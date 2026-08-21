-- Phase 1: projects table. Mirrors the existing MySQL `projects` table.
-- The gantt payload itself stays a single JSON blob (data), matching the
-- existing app's storage model — but authorization-relevant columns
-- (organization_id, owner_id) are plain relational columns, never derived
-- from inside that JSON, per the explicit Phase 1 direction.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  public_id text not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  owner_id uuid not null references public.profiles (id),
  title text not null,
  client text,
  event_month text,
  data jsonb not null default '{}'::jsonb,
  -- Format/shape version of the `data` JSON payload itself (e.g. bump this
  -- when the gantt data structure changes), NOT an optimistic-concurrency
  -- counter. Row-level optimistic locking for concurrent edits is an
  -- explicitly deferred Phase 2 item — Phase 1 keeps the existing
  -- last-write-wins update semantics unchanged.
  data_schema_version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.projects.data_schema_version is
  'Version of the JSON *shape* stored in data, for future format migrations. Unrelated to concurrent-edit locking (see migration header comment).';

create unique index if not exists projects_public_id_unique on public.projects (public_id);
create index if not exists projects_organization_id_idx on public.projects (organization_id);
create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists projects_archived_at_idx on public.projects (archived_at);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();

-- === RLS ===
alter table public.projects enable row level security;

-- The full SELECT policy (owner OR active project_members row) needs the
-- project_members table, created in the next migration — see
-- projects_select_member in 20260821000005_project_members.sql. RLS is
-- enabled here already, so until that policy is added, no non-service-role
-- caller can read any row (fail closed, not fail open).

-- === Grants ===
-- No direct INSERT/UPDATE/DELETE from the client in Phase 1. The existing
-- tRPC procedures for these (admin-only create, recent-auth-gated
-- delete/archive, cascading deletes, activity + security-audit logging) move
-- to Edge Functions running as service_role in Phase 2 — they are
-- authorization + audit logic, not plain CRUD, and RLS alone cannot express
-- "record an audit row on every denied attempt" or "require re-auth within
-- the last 15 minutes".
revoke all on public.projects from anon;
revoke all on public.projects from authenticated;
grant select on public.projects to authenticated;
