// create-invite: owner/editor only, recent-auth required. It issues an opaque
// invite token (only a SHA-256 hash is stored) and a one-time Supabase Auth
// token for the exact invited email. The returned link contains both tokens:
// opening it verifies the Auth token, persists that email's session, then
// consumes the invite token. This keeps the established exact-email check in
// accept-invite while avoiding reliance on Supabase's shared outbound email.
//
// Manus/Gemini review fixes applied here:
//   1. Invited role is EDITOR ONLY. Viewer accounts/invites/logins must never
//      be created (Section 3). The request schema (inviteInput) still
//      accepts "editor" | "viewer" as a literal shape for backward
//      compatibility with the existing (unedited, per the standing
//      constraint) Home.tsx role-selector UI, but this handler rejects
//      anything other than "editor" outright, with a clear, audit-logged
//      denial — the actual security boundary is enforced here, not merely
//      assumed from the UI never asking for anything else.
//   2. ensureAuthUserForEmail() now runs BEFORE any project_members row is
//      written. Previously it ran after the insert/update, so a failure
//      there (anything other than the benign "already exists" case) left a
//      committed "pending" invite whose invitee could never actually log in
//      — a dangling, un-loginable invite with no visible failure state.
//      Running the account-provisioning step first means: if it fails, this
//      function throws before touching project_members at all, so there is
//      nothing dangling to clean up, and the caller sees a real error
//      instead of an invite that silently can never be accepted.

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import {
  AppError,
  ensureAuthUserForEmail,
  recordProjectActivity,
  recordSecurityAudit,
  requireProjectRole,
  requireRecentAuthentication,
} from "../_shared/db.ts";
import { createOpaqueToken, hashIpAddress, hashOpaqueToken } from "../_shared/tokens.ts";
import { inviteInput, parseOrThrow } from "../_shared/validation.ts";

function inviteBaseUrl(rawOrigin: string): string {
  const url = new URL(rawOrigin);
  const origin = url.origin;
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) throw new AppError(400, "招待リンクの発行元が許可されていません。");
  return url.toString().replace(/\/+$/, "") + "/";
}

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const input = parseOrThrow(inviteInput, body);

    await requireRecentAuthentication(user.id);
    const access = await requireProjectRole(input.publicId, user.id, "editor");

    if (input.role !== "editor") {
      // Viewer accounts/invites/logins are no longer offered at all (Section
      // 3). Reject rather than silently downgrade/upgrade the request, so a
      // caller relying on the still-present (but now non-functional) viewer
      // option in the UI gets a clear, actionable message instead of a
      // surprising editor invite they didn't ask for.
      await recordSecurityAudit({
        actorUserId: user.id,
        eventType: "project.invite.create",
        outcome: "denied",
        organizationId: access.project.organization_id,
        projectId: access.project.id,
        metadata: { reason: "viewer_invite_not_supported" },
        ipHash: await hashIpAddress(ip),
      });
      throw new AppError(400, "閲覧者としての招待は提供していません。編集者として招待してください。");
    }

    const supabase = createServiceRoleClient();
    const email = input.email.trim().toLowerCase();
    const appBaseUrl = inviteBaseUrl(input.origin);

    // Provision the login account FIRST (see ensureAuthUserForEmail's own
    // comment for why this is required with shouldCreateUser:false). No
    // email is sent by this step; the owner/editor still shares the invite
    // link and this password via the app's own copy/mailto: flow in the
    // client. If this throws, nothing below has run yet — no invite row is
    // written, so there is no dangling pending invite left behind.
    const tempPassword = await ensureAuthUserForEmail(email);

    const token = createOpaqueToken();
    const tokenHash = await hashOpaqueToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitePath = `/invite?token=${encodeURIComponent(token)}`;

    const { data: existing } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", access.project.id)
      .eq("invited_email", email)
      .maybeSingle();

    const nextInvite = {
      role: "editor" as const,
      status: "pending" as const,
      user_id: null,
      accepted_at: null,
      invite_token_hash: tokenHash,
      invite_expires_at: expiresAt.toISOString(),
      invited_by_user_id: user.id,
    };

    if (existing) {
      const { error } = await supabase.from("project_members").update(nextInvite).eq("id", existing.id);
      if (error) throw new AppError(500, "招待を作成できませんでした。");
    } else {
      const { error } = await supabase
        .from("project_members")
        .insert({ project_id: access.project.id, invited_email: email, ...nextInvite });
      if (error) throw new AppError(500, "招待を作成できませんでした。");
    }

    await recordProjectActivity(access.project.id, user.id, "招待作成", `${email} を編集者として招待しました。`);
    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.invite.create",
      outcome: "success",
      organizationId: access.project.organization_id,
      projectId: access.project.id,
      metadata: { role: "editor" },
      ipHash: await hashIpAddress(ip),
    });

    const inviteUrl = new URL(invitePath, appBaseUrl);
    return {
      inviteUrl: inviteUrl.toString(),
      tempPassword,
      role: "editor" as const,
      invitedBy: access.accessRole,
      expiresAt: expiresAt.toISOString(),
    };
  })
);
