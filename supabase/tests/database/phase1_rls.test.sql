-- Phase 1 RLS allow/deny tests (pgTAP).
-- Run with the Supabase CLI: `supabase test db`
-- (spins up a local Supabase stack incl. pgTAP; requires Docker.)
--
-- Scenario fixtures:
--   org A owns project P1. admin_user owns org A and P1.
--   editor_user has an ACTIVE project_members row on P1 (role=editor).
--   outsider_user has no relationship to org A or P1 at all.
--   anon = no session (unauthenticated).

begin;
select plan(12);

-- --- fixtures --------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'outsider@example.com');
-- profiles rows are auto-created by the on_auth_user_created trigger.

insert into public.organizations (id, public_id, name, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'org-test-1', 'Test Org',
   '11111111-1111-1111-1111-111111111111');

insert into public.organization_members (organization_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');

insert into public.projects (id, public_id, organization_id, owner_id, title, data) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'project-test-1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Test Project', '{}'::jsonb);

insert into public.project_members
  (project_id, user_id, invited_email, role, status, invited_by_user_id)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222',
   'editor@example.com', 'editor', 'active', '11111111-1111-1111-1111-111111111111');

-- --- helper to switch simulated identity -----------------------------------
-- Supabase's local test harness provides auth.uid() via the `authenticated`
-- role + the `request.jwt.claim.sub` GUC. We set it directly here.

-- === anon: cannot read anything =============================================
-- No SELECT grant exists for anon at all (see the REVOKE ALL / no matching
-- GRANT in each migration), so this fails at the privilege-check layer
-- before RLS is even evaluated — a hard permission error, not an empty result
-- set. That's the intended, stricter behavior for "anonにテーブルを直接読ま
-- せない", so the test asserts the error rather than a row count.
set local role anon;
select throws_ok(
  $$ select count(*) from public.projects $$,
  '42501',
  null,
  'anon cannot read any project row (permission denied, not merely 0 rows)'
);
select throws_ok(
  $$ select count(*) from public.project_members $$,
  '42501',
  null,
  'anon cannot read any project_members row (permission denied)'
);
reset role;

-- === owner (admin_user): can read own project + full roster ===============
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*) from public.projects where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 1,
  'owner can read their own project'
);
select is(
  (select count(*) from public.project_members where project_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 1,
  'owner can read the project roster (including pending/active members)'
);
select throws_ok(
  $$ select invite_token_hash from public.project_members limit 1 $$,
  '42501',
  null,
  'invite_token_hash column is never exposed to authenticated readers (permission denied)'
);
reset role;

-- === active editor: can read the project they were added to ===============
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*) from public.projects where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 1,
  'active editor can read the project they were invited to'
);
select is(
  (select count(*) from public.project_members where project_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 1,
  'active editor can read the project roster'
);
reset role;

-- === outsider: cannot read the project or its roster =======================
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select is(
  (select count(*) from public.projects where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 0,
  'un-invited user cannot read a project they are not a member of'
);
select is(
  (select count(*) from public.project_members where project_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 0,
  'un-invited user cannot read that project''s member roster'
);
reset role;

-- === self-escalation guard on organization_members =========================
-- RLS filters which rows an UPDATE is even allowed to see, so a blocked
-- self-update does not raise an error — it silently matches zero rows. We
-- assert that directly rather than expecting an exception.
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.organization_members set role = 'member'
  where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select role from public.organization_members
   where user_id = '11111111-1111-1111-1111-111111111111'
     and organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'owner',
  'an org owner cannot use UPDATE to change their OWN organization_members role (RLS matches 0 rows; role stays "owner")'
);
reset role;

-- === no direct writes to projects from authenticated =======================
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select throws_ok(
  $$ insert into public.projects (public_id, organization_id, owner_id, title, data)
     values ('project-test-2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             '11111111-1111-1111-1111-111111111111', 'Should Fail', '{}'::jsonb) $$,
  '42501',
  null,
  'authenticated cannot INSERT into projects directly (service_role/Edge Function only)'
);
reset role;

-- === organizations: a user with no membership anywhere sees nothing =========
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'fourth@example.com');
set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select is(
  (select count(*) from public.organizations where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::int, 0,
  'a user with no organization_members row anywhere cannot read that organization'
);
reset role;

select * from finish();
rollback;
