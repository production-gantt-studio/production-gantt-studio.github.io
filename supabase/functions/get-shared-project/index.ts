// get-shared-project: mirrors `projects.sharePreview` — the PUBLIC
// (unauthenticated), no-login viewer entry point. Returns ONLY the target
// project + its share expiry — never the member list, invites, activity log,
// audit log, other projects, or any edit capability. This is the sole
// server-side gate a share URL viewer passes through; the client's viewer UI
// must never be trusted to enforce this on its own.

import { withHandler } from "../_shared/http.ts";
import { AppError, getProjectByShareToken, recordSecurityAudit } from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow, tokenInput } from "../_shared/validation.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: false }, async ({ body, ip }) => {
    const input = parseOrThrow(tokenInput, body);

    const target = await getProjectByShareToken(input.token);
    if (!target) {
      await recordSecurityAudit({
        eventType: "project.share.access",
        outcome: "denied",
        metadata: { reason: "invalid_expired_or_revoked" },
        ipHash: await hashIpAddress(ip),
      });
      throw new AppError(404, "共有リンクが無効、失効、または取り消されています。");
    }

    await recordSecurityAudit({
      eventType: "project.share.access",
      outcome: "success",
      organizationId: target.project.organization_id,
      projectId: target.project.id,
      metadata: { shareId: target.share.id },
      ipHash: await hashIpAddress(ip),
    });

    return { project: target.project, expiresAt: target.share.expires_at };
  })
);
