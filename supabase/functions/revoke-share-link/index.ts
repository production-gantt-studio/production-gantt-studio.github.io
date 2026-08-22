// revoke-share-link: mirrors `projects.revokeShare`. Editor-or-above,
// recent-auth required. Sets revoked_at rather than deleting the row, so
// access_count/last_accessed_at history is preserved for audit purposes.
//
// Manus/Gemini review fix (Section 5-2): revoking a link must cascade to
// every descendant (a viewer-forwarded child, that child's own forwarded
// child, and so on) — otherwise a forwarded link would keep working after
// the link that authorized it was revoked. See cascadeRevokeShareLinkDescendants.

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import {
  AppError,
  cascadeRevokeShareLinkDescendants,
  recordSecurityAudit,
  requireProjectRole,
  requireRecentAuthentication,
} from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow } from "../_shared/validation.ts";
import { z } from "npm:zod@3";

const input = z.object({ publicId: z.string().min(1).max(64), shareId: z.string().uuid() });

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const parsed = parseOrThrow(input, body);

    await requireRecentAuthentication(user.id);
    const access = await requireProjectRole(parsed.publicId, user.id, "editor");

    const supabase = createServiceRoleClient();
    const revokedAt = new Date().toISOString();
    const { error } = await supabase
      .from("project_share_links")
      .update({ revoked_at: revokedAt })
      .eq("id", parsed.shareId)
      .eq("project_id", access.project.id);
    if (error) throw new AppError(500, "共有リンクを取り消せませんでした。");

    // Cascade: any child (or grandchild, ...) link forwarded from this one
    // must stop working immediately too.
    await cascadeRevokeShareLinkDescendants(parsed.shareId, revokedAt);

    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.share.revoke",
      outcome: "success",
      organizationId: access.project.organization_id,
      projectId: access.project.id,
      metadata: { shareId: parsed.shareId },
      ipHash: await hashIpAddress(ip),
    });

    return { success: true } as const;
  })
);
