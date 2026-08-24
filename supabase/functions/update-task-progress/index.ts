// update-task-progress: 進行メンバー(project_members.role = "viewer")でも通せる、
// ただ一つの書き込み口。案件に招待されている人(owner / editor / viewer のいずれか)
// なら呼べるが、実際に保存されるのは「タスクの状態」「タスクの担当者」
// 「担当引継ぎの記録」だけに限られる。
//
// update-project(編集者以上)との違いと、なぜ別関数にしたか:
//
//   - update-project は送られてきた案件データをそのまま projects.data へ書く。
//     権限の境界は requireProjectRole(..., "editor") ただ一点。ここは一切変えない
//     ので、進行メンバーは今までどおり 403 で弾かれる(＝既存の編集者の動作に
//     手を入れずに済み、退行の危険が無い)。
//   - こちらは requireProjectRole(..., "viewer") で「招待されていること」だけを
//     確認し、書き込む中身は applyTaskProgressOverlay がDB上の最新データを土台に
//     組み立て直す。呼び出し側が何を送ってきても、結果は必ず
//     「DBの最新データ + 状態 + 担当者 + 引継ぎ」に収まる。
//     許可の判定を「入力の検査」ではなく「出力の組み立て」で行うため、
//     検査漏れという失敗の形そのものが無い。
//   - 土台が常にDBの最新データなので、進行メンバーの端末が古いままでも、
//     その間に編集者が加えた変更を巻き戻さない。
//
// 拒否ではなく無視にした理由: 画面側は既に進行メンバーへ状態・担当者以外の操作を
// 出していない。ここへ許可外の中身が届くのは、画面を介さない直接呼び出し
// (＝正規の操作ではない)のときだけなので、その分を黙って落とすのが最も安全で、
// 正当な操作を誤って弾く事故も起きない。

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { AppError, recordProjectActivity, recordSecurityAudit, requireProjectRole } from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";
import { parseOrThrow, projectInput } from "../_shared/validation.ts";
import { applyTaskProgressOverlay, describeTaskProgressChange } from "../_shared/taskProgress.ts";
import { z } from "npm:zod@3";

// 入力の形は update-project と同じ(画面が同じ案件データをそのまま送るため)。
// title / client / eventMonth は受け取っても使わない — 案件名やクライアント名、
// 開催月は進行メンバーが変更できる項目ではないので、DBの値をそのまま残す。
const input = projectInput.extend({ publicId: z.string().min(1).max(64) });

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const parsed = parseOrThrow(input, body);

    // "viewer" = 「この案件に招待されている人であること」。owner / editor も通る。
    const access = await requireProjectRole(parsed.publicId, user.id, "viewer");

    let incoming: unknown;
    try {
      incoming = JSON.parse(parsed.data);
    } catch {
      throw new AppError(400, "案件データの形式が正しくありません。");
    }

    const overlay = applyTaskProgressOverlay(access.project.data, incoming, new Date().toISOString());
    // 変更が無ければ書き込みも履歴も残さない。画面は入力のたびに自動保存を投げるので、
    // ここで止めないと同じ内容の更新履歴が延々と積まれる。
    if (!overlay.changed) return { success: true, applied: false } as const;

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("projects").update({ data: overlay.data }).eq("id", access.project.id);
    if (error) throw new AppError(500, "進行状況を保存できませんでした。");

    const summary = describeTaskProgressChange(overlay);
    await recordProjectActivity(access.project.id, user.id, "進行更新", summary);
    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.task_progress.update",
      outcome: "success",
      organizationId: access.project.organization_id,
      projectId: access.project.id,
      metadata: {
        publicId: parsed.publicId,
        accessRole: access.accessRole,
        statusChanges: overlay.statusChanges,
        assigneeChanges: overlay.assigneeChanges,
        handoffAdditions: overlay.handoffAdditions,
        handoffAcknowledgements: overlay.handoffAcknowledgements,
      },
      ipHash: await hashIpAddress(ip),
    });

    return { success: true, applied: true } as const;
  })
);
