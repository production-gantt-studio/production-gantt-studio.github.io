// update-project: mirrors `projects.update` — editor-or-above only, no
// recent-auth requirement (matches the original, which only gates recent
// auth on create/delete/archive/restore/invite/revoke/share operations, not
// plain content edits).

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { AppError, recordProjectActivity, recordSecurityAudit, requireProjectRole } from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow, projectInput } from "../_shared/validation.ts";
import { z } from "npm:zod@3";

const input = projectInput.extend({ publicId: z.string().min(1).max(64) });

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const parsed = parseOrThrow(input, body);

    const access = await requireProjectRole(parsed.publicId, user.id, "editor");
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("projects")
      .update({
        title: parsed.title,
        client: parsed.client ?? null,
        event_month: parsed.eventMonth ?? null,
        data: JSON.parse(parsed.data),
      })
      .eq("id", access.project.id);
    if (error) throw new AppError(500, "案件を更新できませんでした。");

    await recordProjectActivity(access.project.id, user.id, "案件更新", `「${parsed.title}」の内容を更新しました。`);
    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.update",
      outcome: "success",
      organizationId: access.project.organization_id,
      projectId: access.project.id,
      metadata: { publicId: parsed.publicId },
      ipHash: await hashIpAddress(ip),
    });

    return { success: true } as const;
  })
);
