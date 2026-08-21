-- Phase 1: project_members table. Mirrors the existing MySQL project_members
-- table (editor/viewer invite state). The invite-creation / accept / revoke
-- BUSINESS LOGIC is explicitly Phase 2 (Edge Function) — this migration only
-- establishes the table shape + RLS foundation so Phase 2 has somewhere to
-- write to.

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid references public.profiles (id),
  invited_email text not null,
  role text not null check (role in ('editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  invite_token_hash text,
  invite_expires_at timestamptz,
  invited_by_user_id uuid not null references public.profiles (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_members_project_email_unique
  on public.project_members (project_id, invited_email);
create unique index if not exists project_members_invite_token_hash_unique
  on public.project_members (invite_token_hash) where invite_token_hash is not null;
create index if not exists project_members_user_id_idx on public.project_members (user_id);
create index if not exists project_members_project_id_idx on public.project_members (project_id);

drop trigger if exists project_members_set_updated_at on public.project_members;
create trigger project_members_set_updated_at
  before update on public.project_members
  for each row
  execute function public.set_updated_at();

-- === RLS ===
alter table public.project_members enable row level security;

-- Deferred from 20260821000004_projects.sql: a project is visible to its
-- owner, or to anyone with an active membership row in it.
drop policy if exists projects_select_member on public.projects;
create policy projects_select_member
  on public.projects
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = projects.id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
    )
  );

-- Roster visibility: the project's owner, or any active member (editor or
-- viewer) of that same project, may see the full member list — matching the
-- existing `projects.members` tRPC procedure's viewer-or-above requirement.
-- This includes pending-invite rows (their invited_email/role/status), same
-- as today. It does NOT include invite_token_hash — see the column-level
-- REVOKE below, which hides that value from every non-service-role reader
-- regardless of this policy.
drop policy if exists project_members_select on public.project_members;
create policy project_members_select
  on public.project_members
  for select
  to authenticated
  using (
    project_id in (select id from public.projects where owner_id = auth.uid())
    or project_id in (
      select project_id from public.project_members
      where user_id = auth.uid() and status = 'active'
    )
  );

-- === Grants ===
-- No client-side INSERT/UPDATE/DELETE in Phase 1: invite creation/acceptance/
-- revocation (with its token hashing, expiry, and audit logging) is Phase 2
-- Edge Function work running as service_role.
revoke all on public.project_members from anon;
revoke all on public.project_members from authenticated;
grant select on public.project_members to authenticated;
-- Defense in depth: even though writes are already blocked entirely, also
-- hide the token hash column from any future SELECT grant so it can never be
-- read back over the API by anyone but service_role.
revoke select (invite_token_hash) on public.project_members from authenticated;
