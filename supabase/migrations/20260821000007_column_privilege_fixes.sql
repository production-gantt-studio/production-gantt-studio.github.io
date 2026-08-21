-- Phase 1 fix (round 2, caught by local grant/RLS verification):
--
-- Column-level REVOKE does not retract a broader table-level GRANT. Postgres
-- checks column access as "table-level privilege OR column-level privilege" —
-- so the pattern used earlier in this migration set,
--   grant update on t to r;
--   revoke update (sensitive_col) on t from r;
-- does NOT actually block updates to sensitive_col: the table-level grant
-- alone is already sufficient, and the column-level revoke has nothing to
-- retract. Verified empirically against a local Postgres instance (not the
-- real Supabase project): after applying migrations 001-006 as originally
-- written, `update profiles set role = 'admin' where id = auth.uid()`
-- succeeded from the authenticated role, and
-- `select invite_token_hash from project_members` returned the column's
-- (null) value instead of raising a permission error.
--
-- This affected two columns:
--   1. profiles.role — must not be updatable by authenticated at all.
--   2. project_members.invite_token_hash — must not be selectable by
--      authenticated at all.
--
-- Fix: revoke the table-level grant entirely, then re-grant only an explicit
-- column allow-list that omits the sensitive column.

revoke update on public.profiles from authenticated;
grant update (email, full_name) on public.profiles to authenticated;

revoke select on public.project_members from authenticated;
grant select (
  id, project_id, user_id, invited_email, role, status,
  invite_expires_at, invited_by_user_id, accepted_at, created_at, updated_at
) on public.project_members to authenticated;
