// create-invite: owner/editor only, recent-auth required. It issues an opaque
// invite token (only a SHA-256 hash is stored) and a one-time Supabase Auth
// token for the exact invited email. The returned link contains both tokens:
// opening it verifies the Auth token, persists that email's session, then
// consumes the invite token. This keeps the established exact-email check in
// accept-invite while avoiding reliance on Supabase's shared outbound email.
//
// 2026-08-24 変更: 招待できる役割を2種類に戻した。
//
//   editor = 編集者。今までどおり、この案件の全部を編集できる。
//   viewer = 進捗担当。ログインは必要だが、できるのは「タスクの状態」と
//            「タスクの担当者」の変更だけ(＋担当引継ぎの記録)。タスクの追加・
//            削除・日程変更・案件設定・招待・共有リンク発行は一切できない。
//            実体は update-task-progress Edge Function 側で担保している。
//
// 以前(Manus/Gemini レビュー時点)は viewer 招待を 400 で拒否していた。これは
// 当時の viewer が「ログインもせず、何も変更できない」役割で、共有リンクと
// 役割が完全に重複していたため。今回 viewer に状態・担当者の変更権限を与え、
// ログインを必須にしたことで重複が解消したので、拒否を取り下げる。
// ログイン不要の閲覧専用は、引き続き共有リンク(create-share-link)が担当する。
//
// Manus/Gemini review fixes applied here (継続):
//   1. ensureAuthUserForEmail() now runs BEFORE any project_members row is
//      written. Previously it ran after the insert/update, so a failure
//      there (anything other than the benign "already exists" case) left a
//      committed "pending" invite whose invitee could never actually log in
//      — a dangling, un-loginable invite with no visible failure state.
//      Running the account-provisioning step first means: if it fails, this
//      function throws before touching project_members at all, so there is
//      nothing dangling to clean up, and the caller sees a real error
//      instead of an invite that silently can never be accepted.

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import {
  AppError,
  ensureAuthUserForEmail,
  recordProjectActivity,
  recordSecurityAudit,
  requireProjectRole,
  requireRecentAuthentication,
} from "../_shared/db.ts";
import { createOpaqueToken, hashIpAddress, hashOpaqueToken } from "../_shared/tokens.ts";
import { inviteInput, parseOrThrow } from "../_shared/validation.ts";
import { isLocalDevOrigin } from "../_shared/cors.ts";

function inviteBaseUrl(rawOrigin: string): string {
  const url = new URL(rawOrigin);
  const origin = url.origin;
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  // ローカル開発・動作検証時は http://localhost:* も許可する(cors.tsのCORS例外と
  // 同じ考え方・同じ関数。2026-08-24追加)。本番からこのOriginが届くことは
  // あり得ないため、本番の許可範囲には影響しない。
  if (!allowed.includes(origin) && !isLocalDevOrigin(origin)) throw new AppError(400, "招待リンクの発行元が許可されていません。");
  return url.toString().replace(/\/+$/, "") + "/";
}

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");
    const input = parseOrThrow(inviteInput, body);

    await requireRecentAuthentication(user.id);
    const access = await requireProjectRole(input.publicId, user.id, "editor");

    const invitedRole = input.role;
    const invitedRoleLabel = invitedRole === "editor" ? "編集者" : "進捗担当";

    const supabase = createServiceRoleClient();
    const email = input.email.trim().toLowerCase();
    const appBaseUrl = inviteBaseUrl(input.origin);

    // Provision the login account FIRST (see ensureAuthUserForEmail's own
    // comment for why this is required with shouldCreateUser:false). No
    // email is sent by this step; the owner/editor still shares the invite
    // link and this password via the app's own copy/mailto: flow in the
    // client. If this throws, nothing below has run yet — no invite row is
    // written, so there is no dangling pending invite left behind.
    const tempPassword = await ensureAuthUserForEmail(email);

    const token = createOpaqueToken();
    const tokenHash = await hashOpaqueToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitePath = `/invite?token=${encodeURIComponent(token)}`;

    const { data: existing } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", access.project.id)
      .eq("invited_email", email)
      .maybeSingle();

    const nextInvite = {
      role: invitedRole,
      status: "pending" as const,
      user_id: null,
      accepted_at: null,
      invite_token_hash: tokenHash,
      invite_expires_at: expiresAt.toISOString(),
      invited_by_user_id: user.id,
    };

    if (existing) {
      const { error } = await supabase.from("project_members").update(nextInvite).eq("id", existing.id);
      if (error) throw new AppError(500, "招待を作成できませんでした。");
    } else {
      const { error } = await supabase
        .from("project_members")
        .insert({ project_id: access.project.id, invited_email: email, ...nextInvite });
      if (error) throw new AppError(500, "招待を作成できませんでした。");
    }

    await recordProjectActivity(access.project.id, user.id, "招待作成", `${email} を${invitedRoleLabel}として招待しました。`);
    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "project.invite.create",
      outcome: "success",
      organizationId: access.project.organization_id,
      projectId: access.project.id,
      metadata: { role: invitedRole },
      ipHash: await hashIpAddress(ip),
    });

    const inviteUrl = new URL(invitePath, appBaseUrl);
    return {
      inviteUrl: inviteUrl.toString(),
      tempPassword,
      role: invitedRole,
      invitedBy: access.accessRole,
      expiresAt: expiresAt.toISOString(),
    };
  })
);
