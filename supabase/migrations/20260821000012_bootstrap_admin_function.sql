-- Phase 2: bootstrap_admin(), a SECURITY DEFINER function that atomically
-- promotes the CALLING user to admin, but only while zero admins exist yet.
-- This is how the very first administrator is established without ever
-- asking the user for SQL, an email address, or any secret: the caller must
-- already hold a valid Supabase session (their email was verified by
-- Supabase Auth itself at sign-in), and the single-writer WHERE NOT EXISTS
-- clause makes the promotion race-safe even if called twice concurrently
-- (exactly one caller can ever succeed while the admin count is zero).
--
-- Exposed to the bootstrap-admin Edge Function, which is the only intended
-- caller (it double-checks the zero-admin precondition before invoking this,
-- and reports the outcome back to the client either way).

create or replace function public.bootstrap_admin(target_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.profiles;
begin
  update public.profiles
  set role = 'admin'
  where id = target_user_id
    and not exists (select 1 from public.profiles where role = 'admin')
  returning * into updated_row;

  return updated_row; -- null if no admin existed to promote into, or one already exists
end;
$$;

comment on function public.bootstrap_admin(uuid) is
  'Promotes target_user_id to admin ONLY if zero admins currently exist. Race-safe via WHERE NOT EXISTS in the same UPDATE. Returns null (no row) if an admin already exists, meaning no promotion happened.';

-- Only authenticated callers may invoke this at all (still gated internally
-- by the zero-admin check above, and only ever called by the
-- bootstrap-admin Edge Function with the caller's own verified user id).
grant execute on function public.bootstrap_admin(uuid) to authenticated;
