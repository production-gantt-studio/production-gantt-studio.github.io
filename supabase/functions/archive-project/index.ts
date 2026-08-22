// archive-project: mirrors `projects.archive`. Stamps BOTH archived_at and
// archive_expires_at in the same update (see the header comment in migration
// 20260821000011 for why archive_expires_at is a plain column set here
// rather than a generated one — timestamptz + interval is not IMMUTABLE).

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import {
  AppError,
  ARCHIVE_RETENTION_MS,
  getProfile,
  recordProjectActivity,
  recordSecurityAudit,
  requireProjectRole,
  requireRecentAuthentication,
} from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow, publicIdInput } from "../_shared/validation.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const input = parseOrThrow(publicIdInput, body);

    await requireRecentAuthentication(user.id);
    const access = await requireProjectRole(input.publicId, user.id, "editor");
    const profile = await getProfile(user.id);
    // Same authority tier as hard delete: archiving starts the 30-day
    // countdown toward the same outcome, so it gets the same protection.
    if (access.accessRole !== "owner" && profile?.role !== "admin") {
      await recordSecurityAudit({
        actorUserId: user.id,
        eventType: "project.archive",
        outcome: "denied",
        projectId: access.project.id,
        organizationId: access.project.organization_id,
        metadata: { reason: "not_owner_or_admin" },
        ipHash: await hashIpAddress(ip),
      });
      throw new AppError(403, "案件をアーカイブする権限がありません。");
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ARCHIVE_RETENTION_MS);
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("projects")
      .update({ archived_at: now.toISOString(), archive_expires_at: expiresAt.toISOString() })
      .eq("id", access.project.id);
    if (error) throw new AppError(500, "案件をアーカイブできませんでした。");

    await recordProjectActivity(
      access.project.id,
      user.id,
      "案件アーカイブ",
      `「${access.project.title}」をアーカイブへ移しました。30日以内は復元できます。`,
    );
    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.archive",
      outcome: "success",
      organizationId: access.project.organization_id,
      projectId: access.project.id,
      metadata: { publicId: input.publicId },
      ipHash: await hashIpAddress(ip),
    });

    return { success: true } as const;
  })
);
