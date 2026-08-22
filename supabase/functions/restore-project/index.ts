// restore-project: mirrors `projects.restore`. Any editor-or-above may
// restore (matches the original — restore has no owner/admin-only gate,
// unlike archive/delete), as long as it's still within the 30-day window;
// once purgeExpiredArchivedProjects has already swept a project past that
// window, the row is gone and this 404s naturally via requireProjectRole.

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import {
  AppError,
  purgeExpiredArchivedProjects,
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
    await purgeExpiredArchivedProjects();
    const access = await requireProjectRole(input.publicId, user.id, "editor");

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("projects")
      .update({ archived_at: null, archive_expires_at: null })
      .eq("id", access.project.id);
    if (error) throw new AppError(500, "案件を復元できませんでした。");

    await recordProjectActivity(
      access.project.id,
      user.id,
      "案件復元",
      `「${access.project.title}」をアーカイブから復元しました。`,
    );
    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.restore",
      outcome: "success",
      organizationId: access.project.organization_id,
      projectId: access.project.id,
      metadata: { publicId: input.publicId },
      ipHash: await hashIpAddress(ip),
    });

    return { success: true } as const;
  })
);
