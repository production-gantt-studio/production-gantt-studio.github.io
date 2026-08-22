-- Phase 2 follow-up fix (Manus/Gemini review): 20260821000012's
-- bootstrap_admin(uuid) was directly EXECUTE-granted to `authenticated`,
-- meaning ANY logged-in user could call `supabase.rpc('bootstrap_admin', {
-- target_user_id: <anyone's uuid> })` straight from the browser and promote
-- an arbitrary account to admin while the admin count was still zero — the
-- "zero admins exist" gate alone is not enough authorization for who gets to
-- become that first admin. This migration locks it down:
--
--   1. EXECUTE is revoked from `authenticated`, `anon`, AND `PUBLIC` — a
--      browser can no longer call this RPC directly at all, regardless of
--      whose id it passes. Only `service_role` may call it. Revoking from
--      `PUBLIC` is not redundant: PostgreSQL grants EXECUTE on every new
--      function to the PUBLIC pseudo-role by default, and every real role
--      (including `authenticated`/`anon`) implicitly inherits whatever
--      PUBLIC can do — a REVOKE aimed only at `authenticated`/`anon`
--      themselves would leave the PUBLIC grant standing and the function
--      just as directly callable as before. This was caught by actually
--      querying information_schema.routine_privileges in local testing
--      after this migration, not assumed from the REVOKE statements alone.
--   2. Because only the `bootstrap-admin` Edge Function ever runs as
--      service_role, the actual authorization now lives entirely in that
--      Edge Function: it resolves the caller's identity itself via
--      getRequestUser(authHeader) (never trusting any user id in the
--      request body), compares that user's own email — case-insensitively,
--      trimmed — against the ADMIN_BOOTSTRAP_EMAIL Function secret, and
--      only then calls this RPC with the id IT resolved. The `target_user_id`
--      parameter therefore never carries client-attacker-controlled input —
--      see supabase/functions/bootstrap-admin/index.ts's own comment for the
--      matching code-side half of this guarantee.
--   3. An advisory transaction lock (pg_advisory_xact_lock) serializes
--      concurrent calls so the "zero admins" check and the promotion happen
--      as one atomic unit even under concurrent invocation — the original
--      WHERE NOT EXISTS on a single UPDATE was already atomic for a single
--      statement, but the lock makes the same guarantee explicit and immune
--      to any future refactor that might split the check from the update
--      across statements.

revoke execute on function public.bootstrap_admin(uuid) from authenticated;
revoke execute on function public.bootstrap_admin(uuid) from anon;
revoke execute on function public.bootstrap_admin(uuid) from public;

create or replace function public.bootstrap_admin(target_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.profiles;
begin
  -- A fixed, arbitrary advisory-lock key scoped to this one operation
  -- (namespace 'bootstrap_admin' hashed to a bigint) — every concurrent
  -- caller blocks here until the first one committing releases the
  -- transaction, so "check zero admins, then promote" can never race.
  perform pg_advisory_xact_lock(hashtext('bootstrap_admin'));

  if exists (select 1 from public.profiles where role = 'admin') then
    return null; -- an admin already exists; no promotion happens, ever
  end if;

  update public.profiles
  set role = 'admin'
  where id = target_user_id
  returning * into updated_row;

  return updated_row;
end;
$$;

comment on function public.bootstrap_admin(uuid) is
  'service_role ONLY (see REVOKE above) — promotes target_user_id to admin, gated by an advisory-lock-serialized zero-admin check. The email-match authorization happens in the bootstrap-admin Edge Function BEFORE this is ever called; target_user_id must always be the Edge Function''s own server-resolved caller id, never a client-supplied value.';

grant execute on function public.bootstrap_admin(uuid) to service_role;
