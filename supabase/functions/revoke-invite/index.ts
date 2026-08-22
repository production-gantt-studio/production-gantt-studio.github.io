// revoke-invite: mirrors `projects.revokeInvite`. Editor-or-above,
// recent-auth required. Marks the member row revoked and clears the token
// hash/expiry so a previously-issued invite link can never be accepted again.

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { AppError, recordProjectActivity, recordSecurityAudit, requireProjectRole, requireRecentAuthentication } from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow } from "../_shared/validation.ts";
import { z } from "npm:zod@3";

const input = z.object({ publicId: z.string().min(1).max(64), memberId: z.string().uuid() });

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const parsed = parseOrThrow(input, body);

    await requireRecentAuthentication(user.id);
    const access = await requireProjectRole(parsed.publicId, user.id, "editor");

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("project_members")
      .update({ status: "revoked", invite_token_hash: null, invite_expires_at: null })
      .eq("id", parsed.memberId)
      .eq("project_id", access.project.id);
    if (error) throw new AppError(500, "招待を取り消せませんでした。");

    await recordProjectActivity(access.project.id, user.id, "招待取消", "メンバー招待を取り消しました。");
    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.invite.revoke",
      outcome: "success",
      organizationId: access.project.organization_id,
      projectId: access.project.id,
      metadata: { memberId: parsed.memberId },
      ipHash: await hashIpAddress(ip),
    });

    return { success: true } as const;
  })
);
