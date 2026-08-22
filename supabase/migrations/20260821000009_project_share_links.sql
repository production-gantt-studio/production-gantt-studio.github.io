-- Phase 2: project_share_links. Mirrors the existing MySQL
-- project_share_links table (revocable viewer-only share URLs, matching the
-- original tRPC `projects.shares` / `createShare` / `revokeShare`).
--
-- The original procedure requires EDITOR-or-above (not viewer) to see or
-- manage share links: `requireProjectRole(publicId, userId, "editor")`. This
-- needs a new helper distinct from is_project_member (which also allows
-- viewers) — see is_project_editor_or_owner below.
--
-- token_hash is never exposed to any authenticated client, same pattern as
-- project_members.invite_token_hash in Phase 1 (column-level REVOKE via an
-- explicit allow-list, not grant-then-revoke — see the Phase 1 postmortem in
-- 20260821000007_column_privilege_fixes.sql for why that distinction matters).

create table if not exists public.project_share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  token_hash text not null,
  created_by_user_id uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists project_share_links_token_hash_unique
  on public.project_share_links (token_hash);
create index if not exists project_share_links_project_id_idx on public.project_share_links (project_id);
create index if not exists project_share_links_expires_at_idx on public.project_share_links (expires_at);

create or replace function public.is_project_editor_or_owner(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_project_owner(target_project_id)
    or exists (
      select 1 from public.project_members
      where project_id = target_project_id
        and user_id = auth.uid()
        and status = 'active'
        and role = 'editor'
    );
$$;

grant execute on function public.is_project_editor_or_owner(uuid) to authenticated;

alter table public.project_share_links enable row level security;

drop policy if exists project_share_links_select on public.project_share_links;
create policy project_share_links_select
  on public.project_share_links
  for select
  to authenticated
  using (public.is_project_editor_or_owner(project_id));

revoke all on public.project_share_links from anon;
revoke all on public.project_share_links from authenticated;
-- Allow-list: every column except token_hash. All writes (create/revoke)
-- still go through Edge Functions only — this SELECT grant exists purely so
-- the "共有リンク" list in the UI can read non-secret columns directly via
-- PostgREST, same pattern as project_members in Phase 1.
grant select (
  id, project_id, created_by_user_id, expires_at, revoked_at,
  last_accessed_at, access_count, created_at
) on public.project_share_links to authenticated;
