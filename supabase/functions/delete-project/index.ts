// delete-project: mirrors `projects.delete` — recent-auth required, and only
// the project's owner OR a global admin may hard-delete (an editor who is
// not the owner/admin cannot), same tier as archive. Cascades the same 4
// tables the original procedure deleted from in order.

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { AppError, getProfile, recordSecurityAudit, requireProjectRole, requireRecentAuthentication } from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow, publicIdInput } from "../_shared/validation.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const input = parseOrThrow(publicIdInput, body);

    await requireRecentAuthentication(user.id);
    const access = await requireProjectRole(input.publicId, user.id, "editor");
    const profile = await getProfile(user.id);
    if (access.accessRole !== "owner" && profile?.role !== "admin") {
      await recordSecurityAudit({
        actorUserId: user.id,
        eventType: "project.delete",
        outcome: "denied",
        projectId: access.project.id,
        organizationId: access.project.organization_id,
        metadata: { reason: "not_owner_or_admin" },
        ipHash: await hashIpAddress(ip),
      });
      throw new AppError(403, "案件を削除する権限がありません。");
    }

    const supabase = createServiceRoleClient();
    await supabase.from("project_activity").delete().eq("project_id", access.project.id);
    await supabase.from("project_share_links").delete().eq("project_id", access.project.id);
    await supabase.from("project_members").delete().eq("project_id", access.project.id);
    const { error } = await supabase.from("projects").delete().eq("id", access.project.id);
    if (error) throw new AppError(500, "案件を削除できませんでした。");

    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.delete",
      outcome: "success",
      organizationId: access.project.organization_id,
      projectId: access.project.id,
      metadata: { publicId: input.publicId },
      ipHash: await hashIpAddress(ip),
    });

    return { success: true } as const;
  })
);
