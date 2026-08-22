-- Move RLS-only SECURITY DEFINER helpers out of the exposed `public` schema.
-- Supabase's Data API cannot invoke functions in this schema, while RLS
-- policies can still call them through explicit schema qualification.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org_id and user_id = auth.uid()
  );
$$;

create or replace function private.is_org_owner_or_admin(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function private.is_project_member(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members
    where project_id = target_project_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function private.is_project_owner(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.projects
    where id = target_project_id and owner_id = auth.uid()
  );
$$;

create or replace function private.is_project_editor_or_owner(target_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.is_project_owner(target_project_id)
    or exists (
      select 1 from public.project_members
      where project_id = target_project_id
        and user_id = auth.uid()
        and status = 'active'
        and role = 'editor'
    );
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.is_org_owner_or_admin(uuid) from public, anon;
revoke all on function private.is_project_member(uuid) from public, anon;
revoke all on function private.is_project_owner(uuid) from public, anon;
revoke all on function private.is_project_editor_or_owner(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.is_org_owner_or_admin(uuid) to authenticated;
grant execute on function private.is_project_member(uuid) to authenticated;
grant execute on function private.is_project_owner(uuid) to authenticated;
grant execute on function private.is_project_editor_or_owner(uuid) to authenticated;

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
  on public.organizations for select to authenticated
  using ((select private.is_org_member(id)));

drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select
  on public.organization_members for select to authenticated
  using (user_id = auth.uid() or (select private.is_org_member(organization_id)));

drop policy if exists organization_members_update_others on public.organization_members;
create policy organization_members_update_others
  on public.organization_members for update to authenticated
  using (user_id <> auth.uid() and (select private.is_org_owner_or_admin(organization_id)))
  with check (user_id <> auth.uid() and (select private.is_org_owner_or_admin(organization_id)));

drop policy if exists projects_select_member on public.projects;
create policy projects_select_member
  on public.projects for select to authenticated
  using (owner_id = auth.uid() or (select private.is_project_member(id)));

drop policy if exists project_members_select on public.project_members;
create policy project_members_select
  on public.project_members for select to authenticated
  using ((select private.is_project_owner(project_id)) or (select private.is_project_member(project_id)));

drop policy if exists project_activity_select on public.project_activity;
create policy project_activity_select
  on public.project_activity for select to authenticated
  using ((select private.is_project_owner(project_id)) or (select private.is_project_member(project_id)));

drop policy if exists project_share_links_select on public.project_share_links;
create policy project_share_links_select
  on public.project_share_links for select to authenticated
  using ((select private.is_project_editor_or_owner(project_id)));

-- The old public helpers remain temporarily for a safe, reversible rollout,
-- but neither client role may invoke them directly.
revoke all on function public.is_org_member(uuid) from public, anon, authenticated;
revoke all on function public.is_org_owner_or_admin(uuid) from public, anon, authenticated;
revoke all on function public.is_project_member(uuid) from public, anon, authenticated;
revoke all on function public.is_project_owner(uuid) from public, anon, authenticated;
revoke all on function public.is_project_editor_or_owner(uuid) from public, anon, authenticated;
