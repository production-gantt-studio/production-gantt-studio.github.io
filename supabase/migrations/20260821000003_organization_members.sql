-- Phase 1: organization_members join table (organization-scoped role:
-- owner | admin | member). Mirrors the existing MySQL organization_members
-- table.

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_members_org_user_unique
  on public.organization_members (organization_id, user_id);
create index if not exists organization_members_user_id_idx on public.organization_members (user_id);
create index if not exists organization_members_org_id_idx on public.organization_members (organization_id);

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row
  execute function public.set_updated_at();

-- === RLS ===
alter table public.organization_members enable row level security;

-- Now that organization_members exists, add the deferred organizations SELECT
-- policy: a user may read an org iff they have a membership row in it.
drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
    )
  );

-- Members can see their own membership row, and the full roster of any
-- organization they belong to (needed for a future member-list screen).
drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select
  on public.organization_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Self-escalation guard, encoded at the ROW level (stronger than a column
-- REVOKE alone): an owner/admin of the org may update OTHER members' rows,
-- but never their own. A member can never change their own role via this
-- policy, full stop — regardless of which column they attempt to touch.
drop policy if exists organization_members_update_others on public.organization_members;
create policy organization_members_update_others
  on public.organization_members
  for update
  to authenticated
  using (
    user_id <> auth.uid()
    and organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
  with check (
    user_id <> auth.uid()
    and organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- === Grants ===
-- INSERT/DELETE stay service_role-only in Phase 1 (membership creation is
-- part of ensureOrganizationMember(), moving to an Edge Function in Phase 2).
revoke all on public.organization_members from anon;
revoke all on public.organization_members from authenticated;
grant select, update on public.organization_members to authenticated;
