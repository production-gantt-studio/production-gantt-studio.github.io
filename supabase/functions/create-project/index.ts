// create-project: admin-only, mirrors the `projects.create` tRPC procedure
// in server/routers.ts exactly (admin-role check, recent-auth requirement,
// ensureOrganizationForOwner, insert, activity + audit logging).

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import {
  AppError,
  ensureOrganizationForOwner,
  getProfile,
  recordProjectActivity,
  recordSecurityAudit,
  requireRecentAuthentication,
} from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow, projectInput } from "../_shared/validation.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const input = parseOrThrow(projectInput, body);

    const profile = await getProfile(user.id);
    if (!profile || profile.role !== "admin") {
      await recordSecurityAudit({
        actorUserId: user.id,
        eventType: "project.create",
        outcome: "denied",
        metadata: { reason: "not_admin" },
        ipHash: await hashIpAddress(ip),
      });
      throw new AppError(403, "新規案件を作成する権限がありません。");
    }
    await requireRecentAuthentication(user.id);

    const organization = await ensureOrganizationForOwner(user.id);
    const supabase = createServiceRoleClient();
    const publicId = `project-${crypto.randomUUID().slice(0, 12)}`;

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        public_id: publicId,
        organization_id: organization.id,
        owner_id: user.id,
        title: input.title,
        client: input.client ?? null,
        event_month: input.eventMonth ?? null,
        data: JSON.parse(input.data),
      })
      .select("id")
      .single();
    if (error || !project) throw new AppError(500, "案件を作成できませんでした。");

    await recordProjectActivity(project.id, user.id, "案件作成", `「${input.title}」を作成しました。`);
    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.create",
      outcome: "success",
      organizationId: organization.id,
      projectId: project.id,
      metadata: { publicId },
      ipHash: await hashIpAddress(ip),
    });

    return { publicId };
  })
);
