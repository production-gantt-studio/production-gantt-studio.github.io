-- Security hardening: prevent client roles from calling internal trigger and
-- SECURITY DEFINER helper functions directly via PostgREST RPC.
--
-- RLS policies still need the membership helpers during policy evaluation, so
-- authenticated retains EXECUTE on those helpers only. Trigger/event-trigger
-- functions are invoked by PostgreSQL and must never be exposed as RPC calls.

revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.handle_new_auth_user() from anon;
revoke all on function public.handle_new_auth_user() from authenticated;

revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon;
revoke all on function public.rls_auto_enable() from authenticated;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_owner_or_admin(uuid) from public;
revoke all on function public.is_project_member(uuid) from public;
revoke all on function public.is_project_owner(uuid) from public;
revoke all on function public.is_project_editor_or_owner(uuid) from public;

revoke all on function public.is_org_member(uuid) from anon;
revoke all on function public.is_org_owner_or_admin(uuid) from anon;
revoke all on function public.is_project_member(uuid) from anon;
revoke all on function public.is_project_owner(uuid) from anon;
revoke all on function public.is_project_editor_or_owner(uuid) from anon;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_owner_or_admin(uuid) to authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_owner(uuid) to authenticated;
grant execute on function public.is_project_editor_or_owner(uuid) to authenticated;

-- `set_updated_at` is a trigger function, not a direct API endpoint. Fix its
-- mutable search_path finding without changing its trigger behavior.
alter function public.set_updated_at() set search_path = public;
