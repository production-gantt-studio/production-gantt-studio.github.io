-- Phase 2: add archive_expires_at to projects, per the 30-day archive/restore
-- spec.
--
-- First attempt used `generated always as (archived_at + interval '30 days')
-- stored`, which failed local verification with "generation expression is
-- not immutable" — Postgres treats timestamptz + interval as STABLE (not
-- IMMUTABLE) because day/month-length arithmetic depends on the session
-- timezone, and generated columns require an IMMUTABLE expression. Fixed by
-- using a plain column set explicitly, together with archived_at, by the
-- archive-project Edge Function (both stamped in the same transaction — see
-- supabase/functions/archive-project) instead of relying on the database to
-- derive one from the other.

alter table public.projects
  add column if not exists archive_expires_at timestamptz;

create index if not exists projects_archive_expires_at_idx on public.projects (archive_expires_at);
