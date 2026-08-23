// Phase 2 shared: data-access + authorization helpers used by every business
// Edge Function. Ports the logic from server/db.ts and server/routers.ts
// (requireProjectRole, ensureOrganizationForOwner, archive/restore,
// recordProjectActivity, recordSecurityAudit, purgeExpiredArchivedProjects,
// getProjectByInviteToken, getProjectByShareToken) onto the Phase 1/2
// Supabase schema — same authorization rules, same audit trail, same lazy
// 30-day archive-purge behavior. All functions here run against the
// service-role client (bypasses RLS), because this IS the authorization
// layer that RLS alone cannot express (recent-auth windows, audit-on-deny,
// cross-table cascades, token issuance).

import { createServiceRoleClient } from "./supabaseClients.ts";
import { hashOpaqueToken } from "./tokens.ts";

export const ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const RECENT_AUTH_WINDOW_MS = 15 * 60 * 1000;

export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function computeArchiveExpiresAt(archivedAt: string): string {
  return new Date(new Date(archivedAt).getTime() + ARCHIVE_RETENTION_MS).toISOString();
}

export function archiveDaysRemaining(archivedAt: string): number {
  const msRemaining = new Date(archivedAt).getTime() + ARCHIVE_RETENTION_MS - Date.now();
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

/**
 * Mirrors requireRecentAuthentication in server/routers.ts. Supabase does not
 * expose a per-session "login time" the way the original custom session
 * cookie did, but auth.users.last_sign_in_at (via the admin API) reflects the
 * moment the user actually completed sign-in (email OTP verification) — as
 * opposed to the access token's own `iat`, which advances on every silent
 * token refresh and would defeat the point of this check. This function
 * always re-reads last_sign_in_at from the service-role admin API rather
 * than trusting anything in the caller's JWT.
 */
export async function requireRecentAuthentication(userId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) throw new AppError(500, "ユーザー情報を確認できませんでした。");
  const lastSignInAt = data.user.last_sign_in_at ? new Date(data.user.last_sign_in_at).getTime() : 0;
  if (Date.now() - lastSignInAt > RECENT_AUTH_WINDOW_MS) {
    await recordSecurityAudit({
      actorUserId: userId,
      eventType: "auth.recent_auth_required",
      outcome: "denied",
      metadata: { reason: "stale_session" },
    });
    throw new AppError(412, "安全のため、ログインし直してからこの操作を行ってください。");
  }
}

export async function getProfile(userId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("profiles").select("id, email, role").eq("id", userId).maybeSingle();
  if (error) throw new AppError(500, "プロフィールを取得できませんでした。");
  return data;
}

export async function ensureOrganizationForOwner(ownerId: string) {
  const supabase = createServiceRoleClient();
  const { data: existing, error: selectError } = await supabase
    .from("organizations")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (selectError) throw new AppError(500, "組織を確認できませんでした。");
  if (existing) return existing;

  const publicId = `org-${crypto.randomUUID().slice(0, 12)}`;
  const { data: created, error: insertError } = await supabase
    .from("organizations")
    .insert({ public_id: publicId, name: "My Organization", owner_id: ownerId })
    .select("*")
    .single();
  if (insertError || !created) throw new AppError(500, "組織を作成できませんでした。");

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({ organization_id: created.id, user_id: ownerId, role: "owner" });
  if (memberError) throw new AppError(500, "組織メンバーを作成できませんでした。");

  return created;
}

/**
 * Every login uses signInWithOtp({ shouldCreateUser: false }) per the Turn K
 * spec — self-service signup is intentionally disabled, so an email-link
 * login can only ever succeed for an email that ALREADY has a Supabase Auth
 * account. That means every invited editor/viewer's auth.users row must be
 * provisioned server-side, at invite time, by something holding the
 * service-role key — never by the invitee signing themselves up. This is
 * that provisioning step: create the auth user (no email sent — Supabase's
 * own invite/confirmation email is never triggered; the app's own copy-link
 * + mailto: flow is the only "invite email" that ever goes out), or silently
 * no-op if the account already exists (idempotent — re-inviting the same
 * address must not error).
 */
function randomTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

/**
 * Ensures a login account exists for the invited email and always gives it a
 * fresh, random password — including on a re-invite, so the invite text the
 * admin just generated always matches a working password. No email is sent
 * by this step; the invite link/password are shared via the app's own
 * copy/mailto flow.
 */
export async function ensureAuthUserForEmail(email: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const password = randomTempPassword();
  const { error } = await supabase.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) {
    const alreadyExists = /already|exists|registered/i.test(error.message ?? "");
    if (!alreadyExists) {
      throw new AppError(500, "招待先のログイン用アカウントを準備できませんでした。");
    }
    let match: { id: string } | undefined;
    for (let page = 1; page <= 20 && !match; page++) {
      const { data } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (!data?.users.length) break;
      match = data.users.find((u) => u.email?.toLowerCase() === email);
    }
    if (!match) throw new AppError(500, "招待先のログイン用アカウントを準備できませんでした。");
    const { error: updateError } = await supabase.auth.admin.updateUserById(match.id, { password });
    if (updateError) throw new AppError(500, "招待先のパスワードを設定できませんでした。");
  }
  return password;
}

export async function ensureOrganizationMember(organizationId: string, userId: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("organization_members")
    .upsert({ organization_id: organizationId, user_id: userId, role: "member" }, { onConflict: "organization_id,user_id" });
  if (error) throw new AppError(500, "組織メンバーを追加できませんでした。");
}

export type ProjectAccessRole = "owner" | "editor" | "viewer";

/**
 * Mirrors getProjectAccess in server/db.ts, ported to the uuid schema: a
 * project's owner_id already implies organization ownership (set together in
 * ensureOrganizationForOwner), so no separate organization_members join is
 * needed here — this matches the projects_select_member RLS policy exactly.
 */
export async function getProjectAccess(publicId: string, userId: string) {
  const supabase = createServiceRoleClient();
  const { data: project, error } = await supabase.from("projects").select("*").eq("public_id", publicId).maybeSingle();
  if (error) throw new AppError(500, "案件を確認できませんでした。");
  if (!project) return null;

  if (project.owner_id === userId) return { project, accessRole: "owner" as ProjectAccessRole };

  const { data: member, error: memberError } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", project.id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (memberError) throw new AppError(500, "権限を確認できませんでした。");
  if (!member) return null;
  return { project, accessRole: member.role as ProjectAccessRole };
}

export async function recordProjectActivity(projectId: string, actorUserId: string | null, action: string, detail: string) {
  const supabase = createServiceRoleClient();
  await supabase.from("project_activity").insert({ project_id: projectId, actor_user_id: actorUserId, action, detail });
}

export async function recordSecurityAudit(input: {
  organizationId?: string | null;
  projectId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  outcome: "success" | "denied" | "failure";
  metadata: Record<string, unknown>;
  ipHash?: string | null;
}) {
  const supabase = createServiceRoleClient();
  // Audit logging must never fail (or mask the failure of) the underlying
  // operation — swallow and log to stderr instead of throwing.
  const { error } = await supabase.from("security_audit_logs").insert({
    organization_id: input.organizationId ?? null,
    project_id: input.projectId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    outcome: input.outcome,
    metadata: input.metadata,
    ip_hash: input.ipHash ?? null,
  });
  if (error) console.error("[recordSecurityAudit] insert failed:", error.message);
}

/**
 * Mirrors requireProjectRole in server/routers.ts: resolves access and
 * throws FORBIDDEN (audit-logged) if the caller doesn't have at least the
 * required role. "viewer" required = any access role qualifies; "editor"
 * required = owner or editor only.
 */
export async function requireProjectRole(publicId: string, userId: string, required: "viewer" | "editor") {
  const access = await getProjectAccess(publicId, userId);
  if (!access || (required === "editor" && access.accessRole === "viewer")) {
    await recordSecurityAudit({ actorUserId: userId, eventType: "project.access", outcome: "denied", metadata: { publicId, required } });
    throw new AppError(403, "この案件を編集する権限がありません。");
  }
  return access;
}

// No scheduled job (no pg_cron): expiry is enforced lazily, exactly like the
// original LocalStorage-only 30-day archive behavior and Phase 1's stated
// direction — every archive-project/restore-project/list call sweeps first.
export async function purgeExpiredArchivedProjects() {
  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - ARCHIVE_RETENTION_MS).toISOString();
  const { data: expired, error } = await supabase
    .from("projects")
    .select("id")
    .not("archived_at", "is", null)
    .lt("archived_at", cutoff);
  if (error || !expired?.length) return;
  const ids = expired.map((row) => row.id);
  await supabase.from("project_activity").delete().in("project_id", ids);
  await supabase.from("project_share_links").delete().in("project_id", ids);
  await supabase.from("project_members").delete().in("project_id", ids);
  await supabase.from("projects").delete().in("id", ids);
}

export async function getProjectByInviteToken(inviteToken: string) {
  const supabase = createServiceRoleClient();
  const tokenHash = await hashOpaqueToken(inviteToken);
  const { data: member, error } = await supabase
    .from("project_members")
    .select("*")
    .eq("invite_token_hash", tokenHash)
    .eq("status", "pending")
    .gt("invite_expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !member) return null;
  const { data: project } = await supabase.from("projects").select("*").eq("id", member.project_id).maybeSingle();
  if (!project) return null;
  return { project, member };
}

export type ShareLinkRow = {
  id: string;
  project_id: string;
  parent_share_link_id: string | null;
  expires_at: string;
  revoked_at: string | null;
};

// A normal owner/editor-issued link has parent_share_link_id = null, so real
// chains are 1 deep; a forwarded child is 2; this bound is purely a
// defensive backstop against any future data anomaly (e.g. a corrupted
// self-reference) — it must never be reached in ordinary operation.
const MAX_SHARE_LINK_CHAIN_DEPTH = 10;

/**
 * Walks a share link's parent_share_link_id chain from itself up to its
 * root, re-validating every ancestor's revoked_at/expires_at at READ TIME —
 * not just trusting whatever was true when a child link was minted. This is
 * what closes the Section 5-2 concurrency gap: if a parent is revoked AFTER
 * a child was created, the child must stop working on its very next access,
 * not merely "eventually" or only if someone re-checks the parent later.
 *
 * Returns the full chain (the link identified by `leafId` first, its parent
 * next, and so on up to the root) if every link in it is currently valid, or
 * null if the leaf itself, or any ancestor, is missing/revoked/expired.
 */
export async function resolveValidShareLinkChain(leafId: string): Promise<ShareLinkRow[] | null> {
  const supabase = createServiceRoleClient();
  const chain: ShareLinkRow[] = [];
  let currentId: string | null = leafId;
  const now = Date.now();

  for (let depth = 0; depth < MAX_SHARE_LINK_CHAIN_DEPTH; depth++) {
    if (!currentId) break;
    const result = await supabase
      .from("project_share_links")
      .select("id, project_id, parent_share_link_id, expires_at, revoked_at")
      .eq("id", currentId)
      .maybeSingle();
    const row = result.data as ShareLinkRow | null;
    if (result.error || !row) return null;
    if (row.revoked_at) return null;
    if (new Date(row.expires_at).getTime() <= now) return null;
    chain.push(row);
    currentId = row.parent_share_link_id ?? null;
  }
  if (currentId) {
    // Chain deeper than MAX_SHARE_LINK_CHAIN_DEPTH — treat as invalid rather
    // than silently accepting a partially-validated chain.
    return null;
  }
  return chain;
}

/**
 * Cascading revoke: revoking a link must immediately invalidate every
 * descendant — children, grandchildren, and so on — not only the single row
 * the caller named. Without this, a viewer-forwarded child link would keep
 * working after the parent that authorized it was revoked, which Section
 * 5-2 explicitly forbids. Walks the descendant tree breadth-first, marking
 * each still-active level revoked before descending into the next.
 */
export async function cascadeRevokeShareLinkDescendants(rootId: string, revokedAtIso: string): Promise<void> {
  const supabase = createServiceRoleClient();
  let frontier = [rootId];
  const seen = new Set<string>([rootId]);

  while (frontier.length) {
    const { data: children, error } = await supabase
      .from("project_share_links")
      .select("id")
      .in("parent_share_link_id", frontier)
      .is("revoked_at", null);
    if (error || !children?.length) break;

    const ids = (children as Array<{ id: string }>).map((c) => c.id).filter((id) => !seen.has(id));
    if (!ids.length) break;
    ids.forEach((id) => seen.add(id));

    await supabase.from("project_share_links").update({ revoked_at: revokedAtIso }).in("id", ids);
    frontier = ids;
  }
}

export async function getProjectByShareToken(token: string) {
  const supabase = createServiceRoleClient();
  const tokenHash = await hashOpaqueToken(token);
  const { data: share, error } = await supabase
    .from("project_share_links")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !share) return null;

  // Re-validate the FULL ancestor chain at read time, not just this row's own
  // columns — a normal (non-forwarded) link is its own one-link chain, so
  // this subsumes the old "is.revoked_at.null + expires_at > now" check
  // exactly, while also correctly rejecting a forwarded child whose parent
  // was revoked or expired since the child was minted.
  const chain = await resolveValidShareLinkChain(share.id);
  if (!chain) return null;

  const { data: project } = await supabase.from("projects").select("*").eq("id", share.project_id).maybeSingle();
  if (!project) return null;
  await supabase
    .from("project_share_links")
    .update({ last_accessed_at: new Date().toISOString(), access_count: (share.access_count ?? 0) + 1 })
    .eq("id", share.id);
  return { project, share };
}
