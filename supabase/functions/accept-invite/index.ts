// accept-invite: mirrors `projects.acceptInvite`. Requires the caller to
// already be authenticated (they must have completed Supabase email-link
// login first — normally to the exact invited address, but the original
// procedure's own security is the case-insensitive, whitespace-trimmed
// email-match check below, not merely "which address did they log in with",
// so that check is reproduced exactly), and their email must match the
// invited_email on the token after normalizing both sides (trim + lowercase)
// — this is the same defense-in-depth the original had beyond just
// "possession of the token". The token itself is consumed exactly once:
// invite_token_hash/invite_expires_at are cleared in the same update that
// activates membership, so a second accept attempt with the same token finds
// no matching pending row at all (getProjectByInviteToken requires
// status = 'pending').

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import {
  AppError,
  ensureOrganizationMember,
  getProjectByInviteToken,
  recordProjectActivity,
  recordSecurityAudit,
} from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow, tokenInput } from "../_shared/validation.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const input = parseOrThrow(tokenInput, body);

    const target = await getProjectByInviteToken(input.token);
    if (!target) throw new AppError(404, "招待リンクが見つからないか、期限切れです。");

    const normalizedCallerEmail = user.email?.trim().toLowerCase() ?? "";
    const normalizedInvitedEmail = target.member.invited_email.trim().toLowerCase();
    if (!normalizedCallerEmail || normalizedCallerEmail !== normalizedInvitedEmail) {
      await recordSecurityAudit({
        actorUserId: user.id,
        eventType: "project.invite.accept",
        outcome: "denied",
        organizationId: target.project.organization_id,
        projectId: target.project.id,
        metadata: { reason: "email_mismatch" },
        ipHash: await hashIpAddress(ip),
      });
      throw new AppError(403, "招待されたメールアドレスでログインしてください。");
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("project_members")
      .update({
        user_id: user.id,
        status: "active",
        accepted_at: new Date().toISOString(),
        invite_token_hash: null,
        invite_expires_at: null,
      })
      .eq("id", target.member.id);
    if (error) throw new AppError(500, "招待を受諾できませんでした。");

    await ensureOrganizationMember(target.project.organization_id, user.id);

    await recordProjectActivity(
      target.project.id,
      user.id,
      "招待受諾",
      `招待を受諾し、${target.member.role === "editor" ? "編集者" : "進行メンバー"}として参加しました。`,
    );
    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.invite.accept",
      outcome: "success",
      organizationId: target.project.organization_id,
      projectId: target.project.id,
      metadata: { role: target.member.role },
      ipHash: await hashIpAddress(ip),
    });

    return { publicId: target.project.public_id, role: target.member.role };
  })
);
