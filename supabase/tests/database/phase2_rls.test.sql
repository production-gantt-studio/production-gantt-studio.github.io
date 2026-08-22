-- Phase 2 RLS allow/deny tests (pgTAP).
-- Run with the Supabase CLI: `supabase test db`
-- (spins up a local Supabase stack incl. pgTAP; requires Docker.)
--
-- Covers the 3 new Phase 2 tables (project_activity, project_share_links,
-- security_audit_logs) and the archive_expires_at column added to projects.
-- Reuses the same fixture shape as phase1_rls.test.sql: org A owns project
-- P1; admin_user owns org A and P1; editor_user has an ACTIVE
-- project_members row on P1 (role=editor); outsider_user has no relationship
-- to org A or P1 at all.

begin;
select plan(12);

-- --- fixtures --------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'editor@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'outsider@example.com');

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

insert into public.project_activity (project_id, actor_user_id, action, detail) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111',
   'project_created', 'seed fixture');

insert into public.project_share_links (project_id, token_hash, created_by_user_id, expires_at) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'deadbeefcafe', '11111111-1111-1111-1111-111111111111',
   now() + interval '7 days');

-- === project_activity: owner and active editor (viewer-or-above) can read ===
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*) from public.project_activity where project_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 1,
  'project owner can read project_activity'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*) from public.project_activity where project_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 1,
  'active editor (viewer-or-above) can read project_activity'
);
reset role;

-- === project_activity: outsider cannot read =================================
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select is(
  (select count(*) from public.project_activity where project_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 0,
  'un-invited user cannot read project_activity'
);
reset role;

-- === project_share_links: requires editor-or-above (NOT viewer) =============
-- The original tRPC `projects.shares` procedure requires
-- requireProjectRole(publicId, userId, "editor") — stricter than
-- project_activity/project_members, which also allow plain viewers. Both the
-- owner and the active editor fixture above qualify as editor-or-above, so
-- this suite cannot distinguish "editor" from "viewer-excluded" with only
-- those two identities; the exclusion itself is verified structurally, since
-- is_project_editor_or_owner's WHERE clause has no branch matching
-- role = 'viewer' at all (see migration 20260821000009).
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*) from public.project_share_links where project_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 1,
  'project owner (editor-or-above) can read project_share_links'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*) from public.project_share_links where project_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 1,
  'active editor (editor-or-above) can read project_share_links'
);
reset role;

-- === project_share_links: token_hash is never exposed =======================
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select throws_ok(
  $$ select token_hash from public.project_share_links limit 1 $$,
  '42501',
  null,
  'token_hash column is never exposed to authenticated readers (permission denied)'
);
reset role;

-- === project_share_links: outsider cannot read ==============================
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select is(
  (select count(*) from public.project_share_links where project_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::int, 0,
  'un-invited user cannot read project_share_links'
);
reset role;

-- === security_audit_logs: fail-closed for anon and authenticated ===========
set local role anon;
select throws_ok(
  $$ select count(*) from public.security_audit_logs $$,
  '42501',
  null,
  'anon cannot read security_audit_logs (no policies at all, permission denied)'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select throws_ok(
  $$ select count(*) from public.security_audit_logs $$,
  '42501',
  null,
  'authenticated (even the project/org owner) cannot read security_audit_logs (no grant at all)'
);
reset role;

-- === bootstrap_admin: direct RPC call is rejected for every client-facing
-- role (Manus/Gemini review Section 2 / Section 7 test #1). Confirmed via
-- information_schema in local testing that EXECUTE must be revoked from
-- PUBLIC as well as authenticated/anon — see migration
-- 20260821000013_bootstrap_admin_lockdown.sql's own comment for why a REVOKE
-- aimed only at authenticated/anon would NOT have been sufficient on its
-- own (PostgreSQL grants EXECUTE to PUBLIC by default, and every role
-- implicitly inherits PUBLIC's privileges).
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select throws_ok(
  $$ select public.bootstrap_admin('22222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'authenticated cannot call bootstrap_admin directly (permission denied)'
);
reset role;

set local role anon;
select throws_ok(
  $$ select public.bootstrap_admin('22222222-2222-2222-2222-222222222222') $$,
  '42501',
  null,
  'anon cannot call bootstrap_admin directly (permission denied)'
);
reset role;

-- === project_share_links: parent_share_link_id is a readable, non-secret
-- column (Section 5-2) — only token_hash stays hidden ========================
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select lives_ok(
  $$ select parent_share_link_id from public.project_share_links limit 1 $$,
  'parent_share_link_id is readable by editor-or-above (not a secret column)'
);
reset role;

select * from finish();
rollback;
