-- Phase 1 fix: the initial cross-table RLS policies (organizations <->
-- organization_members, projects <-> project_members, and each table's
-- self-referencing "am I a member of this same org/project" subquery)
-- triggered "infinite recursion detected in policy for relation ...".
--
-- This was caught by local RLS verification (a disposable Postgres instance
-- with an emulated auth schema — no connection to the real Supabase project
-- was made or needed) before anything was shipped.
--
-- Root cause: a policy on table X that subqueries table X itself (or a table
-- whose own policy subqueries back into X) re-triggers RLS evaluation on X
-- for every row of the subquery, which re-triggers the same policy, etc.
--
-- Standard fix: move the "does auth.uid() belong to this org/project"
-- lookups into SECURITY DEFINER helper functions. Because these functions
-- are owned by the same role that owns the tables (the migration/table
-- owner), Postgres lets that owner bypass RLS on its own tables by default
-- (no FORCE ROW LEVEL SECURITY is set anywhere in this schema) — so the
-- helper's internal query does not re-invoke the policy that called it.

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_owner_or_admin(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_project_member(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = target_project_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_project_owner(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.projects
    where id = target_project_id and owner_id = auth.uid()
  );
$$;

-- Client roles never need to call these directly (policies call them
-- internally), but EXECUTE must still be granted or policy evaluation itself
-- fails with a permission error.
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_owner_or_admin(uuid) to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_owner(uuid) to authenticated;

-- === Replace the recursive policies ===

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (public.is_org_member(id));

drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select
  on public.organization_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_org_member(organization_id)
  );

drop policy if exists organization_members_update_others on public.organization_members;
create policy organization_members_update_others
  on public.organization_members
  for update
  to authenticated
  using (
    user_id <> auth.uid()
    and public.is_org_owner_or_admin(organization_id)
  )
  with check (
    user_id <> auth.uid()
    and public.is_org_owner_or_admin(organization_id)
  );

drop policy if exists projects_select_member on public.projects;
create policy projects_select_member
  on public.projects
  for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_project_member(id)
  );

drop policy if exists project_members_select on public.project_members;
create policy project_members_select
  on public.project_members
  for select
  to authenticated
  using (
    public.is_project_owner(project_id)
    or public.is_project_member(project_id)
  );

-- Also caught during local verification: 20260821000002_organizations.sql
-- creates the RLS policy but never grants table-level SELECT to
-- authenticated, so every read failed with "permission denied for table
-- organizations" before RLS was even evaluated.
grant select on public.organizations to authenticated;
