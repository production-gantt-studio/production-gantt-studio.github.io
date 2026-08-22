-- Phase 2: project_activity. Mirrors the existing MySQL project_activity
-- table (human-readable change log shown in the "変更ログ" panel). Visible to
-- the project owner or any active member (editor OR viewer), matching the
-- original tRPC `projects.activity` procedure's viewer-or-above requirement.
-- Written only by Edge Functions (service_role) — never directly by clients.

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_user_id uuid references public.profiles (id),
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_activity_project_created_idx
  on public.project_activity (project_id, created_at desc);

alter table public.project_activity enable row level security;

drop policy if exists project_activity_select on public.project_activity;
create policy project_activity_select
  on public.project_activity
  for select
  to authenticated
  using (
    public.is_project_owner(project_id)
    or public.is_project_member(project_id)
  );

revoke all on public.project_activity from anon;
revoke all on public.project_activity from authenticated;
grant select on public.project_activity to authenticated;
