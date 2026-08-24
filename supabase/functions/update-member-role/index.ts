// update-member-role: mirrors revoke-invite's shape (editor-or-above,
// recent-auth required) but changes an existing member's role instead of
// revoking access. Works for both "pending" (not yet accepted) and "active"
// (already accepted) invitations — the row's `role` column is what
// update-task-progress / requireProjectRole all read to decide what the
// member can do, so flipping it here takes effect immediately whether or
// not they have logged in yet.

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { AppError, recordProjectActivity, recordSecurityAudit, requireProjectRole, requireRecentAuthentication } from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow } from "../_shared/validation.ts";
import { z } from "npm:zod@3";

const input = z.object({
  publicId: z.string().min(1).max(64),
  memberId: z.string().uuid(),
  role: z.enum(["editor", "viewer"]),
});

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const parsed = parseOrThrow(input, body);

    await requireRecentAuthentication(user.id);
    const access = await requireProjectRole(parsed.publicId, user.id, "editor");

    const supabase = createServiceRoleClient();
    const { data: member, error: fetchError } = await supabase
      .from("project_members")
      .select("id, role, status, invited_email")
      .eq("id", parsed.memberId)
      .eq("project_id", access.project.id)
      .maybeSingle();
    if (fetchError) throw new AppError(500, "メンバーを確認できませんでした。");
    if (!member) throw new AppError(404, "メンバーが見つかりません。");
    if (member.status === "revoked") throw new AppError(400, "取り消し済みの招待は変更できません。");

    if (member.role !== parsed.role) {
      const { error } = await supabase
        .from("project_members")
        .update({ role: parsed.role })
        .eq("id", parsed.memberId)
        .eq("project_id", access.project.id);
      if (error) throw new AppError(500, "権限を変更できませんでした。");

      const roleLabel = parsed.role === "editor" ? "編集者" : "進捗担当";
      await recordProjectActivity(access.project.id, user.id, "権限変更", `${member.invited_email} の権限を${roleLabel}に変更しました。`);
      await recordSecurityAudit({
        actorUserId: user.id,
        eventType: "project.member.role_update",
        outcome: "success",
        organizationId: access.project.organization_id,
        projectId: access.project.id,
        metadata: { memberId: parsed.memberId, role: parsed.role },
        ipHash: await hashIpAddress(ip),
      });
    }

    return { success: true } as const;
  })
);
