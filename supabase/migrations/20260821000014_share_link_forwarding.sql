-- Phase 2 follow-up fix (Manus/Gemini review, Section 5-2): adds
-- parent/child linkage to project_share_links so a viewer holding a valid
-- share URL can forward/create a new child share URL scoped to the SAME
-- project, without logging in — while guaranteeing a child link can never
-- outlive its parent and stops working the instant any ancestor is revoked
-- or expires (see _shared/db.ts's resolveValidShareLinkChain and
-- cascadeRevokeShareLinkDescendants, and the new create-forwarded-share-link
-- Edge Function).
--
-- A normal owner/editor-issued link (via create-share-link) still has
-- parent_share_link_id = null, exactly as before this migration — nothing
-- about the existing "owner/editor create/revoke share links" behavior
-- changes; this column is purely additive.

alter table public.project_share_links
  add column if not exists parent_share_link_id uuid references public.project_share_links (id);

create index if not exists project_share_links_parent_share_link_id_idx
  on public.project_share_links (parent_share_link_id);

-- A forwarded child link is minted by an anonymous viewer through the
-- public, no-JWT create-forwarded-share-link Edge Function — there is no
-- authenticated actor to record here, unlike an owner/editor-issued link.
-- created_by_user_id must therefore become nullable; existing rows (all
-- owner/editor-issued, all with a real creator) are unaffected.
alter table public.project_share_links
  alter column created_by_user_id drop not null;

-- Re-declare the full non-secret column allow-list (see 20260821000009's own
-- comment on why this is an explicit allow-list rather than grant-then-
-- revoke) to include the new column. token_hash stays permanently excluded.
revoke all on public.project_share_links from authenticated;
grant select (
  id, project_id, created_by_user_id, expires_at, revoked_at,
  last_accessed_at, access_count, created_at, parent_share_link_id
) on public.project_share_links to authenticated;
