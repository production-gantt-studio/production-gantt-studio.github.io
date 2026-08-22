-- Phase 2: security_audit_logs. Mirrors the existing MySQL
-- security_audit_logs table. Purely an internal audit trail — the original
-- app never exposes this to any client UI, only writes to it from server-side
-- procedures. Same here: no anon/authenticated grants at all. Only
-- service_role (Edge Functions), which bypasses RLS entirely, ever touches
-- this table.

create table if not exists public.security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id),
  project_id uuid references public.projects (id),
  actor_user_id uuid references public.profiles (id),
  event_type text not null,
  outcome text not null check (outcome in ('success', 'denied', 'failure')),
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_logs_org_created_idx
  on public.security_audit_logs (organization_id, created_at desc);
create index if not exists security_audit_logs_project_created_idx
  on public.security_audit_logs (project_id, created_at desc);
create index if not exists security_audit_logs_event_created_idx
  on public.security_audit_logs (event_type, created_at desc);

alter table public.security_audit_logs enable row level security;
-- No policies at all: RLS enabled with zero policies means authenticated/anon
-- can never see any row (fail closed). service_role bypasses RLS by default
-- (table owner), so Edge Functions can still read/write freely.

revoke all on public.security_audit_logs from anon;
revoke all on public.security_audit_logs from authenticated;
