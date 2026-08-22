// invite-preview: mirrors `projects.invitePreview` — a PUBLIC (unauthenticated)
// procedure in the original app (publicProcedure), used by the Invite.tsx
// screen to show "you've been invited to X as editor/viewer" before the user
// even logs in. Deliberately returns the full project only when the invited
// role is "viewer" (matching the original exactly) — an editor invitee only
// sees role/status/expiry until they actually log in and accept.

import { withHandler } from "../_shared/http.ts";
import { AppError, getProjectByInviteToken, recordSecurityAudit } from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow, tokenInput } from "../_shared/validation.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: false }, async ({ body, ip }) => {
    const input = parseOrThrow(tokenInput, body);

    const target = await getProjectByInviteToken(input.token);
    if (!target) {
      await recordSecurityAudit({
        eventType: "project.invite.preview",
        outcome: "denied",
        metadata: { reason: "invalid_or_expired" },
        ipHash: await hashIpAddress(ip),
      });
      throw new AppError(404, "招待リンクが見つからないか、期限切れです。");
    }

    await recordSecurityAudit({
      eventType: "project.invite.preview",
      outcome: "success",
      organizationId: target.project.organization_id,
      projectId: target.project.id,
      metadata: { role: target.member.role },
      ipHash: await hashIpAddress(ip),
    });

    return {
      role: target.member.role,
      status: target.member.status,
      project: target.member.role === "viewer" ? target.project : null,
      expiresAt: target.member.invite_expires_at,
    };
  })
);
