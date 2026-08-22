// bootstrap-admin: promotes the calling (already-authenticated) user to
// global admin, but ONLY when both of these hold:
//   1. Zero admins exist anywhere yet (enforced again, atomically, inside
//      bootstrap_admin() itself — see migration 20260821000013).
//   2. The caller's own verified email matches the ADMIN_BOOTSTRAP_EMAIL
//      Function secret (case-insensitive, trimmed).
//
// Manus/Gemini review fix: the previous version treated "no admin exists
// yet" as sufficient authorization on its own, which let ANY logged-in user
// race to become the first admin. That is no longer true — this function is
// now the ONLY thing that can ever call bootstrap_admin() (its EXECUTE grant
// to `authenticated` was revoked in migration 20260821000013; only
// service_role, which only this function runs as, may call it), and it
// never passes anything other than its own server-resolved `user.id` as the
// promotion target — a request body cannot supply or override that id.
//
// If ADMIN_BOOTSTRAP_EMAIL is not configured at all, this fails closed
// (500), never open — an unset secret must never be treated as "anyone
// qualifies".

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { AppError, recordSecurityAudit } from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, ip }) => {
    if (!user) throw new AppError(401, "ログインしてください。");

    const adminBootstrapEmail = Deno.env.get("ADMIN_BOOTSTRAP_EMAIL");
    if (!adminBootstrapEmail) {
      // Fail closed: an unconfigured secret must never be interpreted as
      // "no restriction" — that would recreate the exact hole this fix
      // closes.
      throw new AppError(500, "初期管理者の設定が完了していません。管理者に確認してください。");
    }

    if (!user.email || normalizeEmail(user.email) !== normalizeEmail(adminBootstrapEmail)) {
      await recordSecurityAudit({
        actorUserId: user.id,
        eventType: "admin.bootstrap",
        outcome: "denied",
        metadata: { reason: "email_mismatch" },
        ipHash: await hashIpAddress(ip),
      });
      // Same message as "already exists" — do not reveal to a non-matching
      // caller whether the mismatch was the reason, vs. an admin already
      // existing, beyond what they could otherwise infer.
      throw new AppError(403, "この操作を行う権限がありません。");
    }

    const supabase = createServiceRoleClient();

    const { count, error: countError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countError) throw new AppError(500, "管理者の有無を確認できませんでした。");

    if ((count ?? 0) > 0) {
      await recordSecurityAudit({
        actorUserId: user.id,
        eventType: "admin.bootstrap",
        outcome: "denied",
        metadata: { reason: "admin_already_exists" },
        ipHash: await hashIpAddress(ip),
      });
      throw new AppError(409, "すでに管理者が登録されています。");
    }

    // target_user_id is ALWAYS this function's own resolved `user.id` —
    // never anything read from the request body — see the module comment.
    const { data: promoted, error: rpcError } = await supabase.rpc("bootstrap_admin", {
      target_user_id: user.id,
    });
    if (rpcError) throw new AppError(500, "管理者への昇格に失敗しました。");
    if (!promoted) {
      // Lost the race to another concurrent call inside the advisory-lock-
      // guarded SQL function itself — not this caller's fault, just already
      // done by the time the lock was acquired.
      await recordSecurityAudit({
        actorUserId: user.id,
        eventType: "admin.bootstrap",
        outcome: "denied",
        metadata: { reason: "lost_race" },
        ipHash: await hashIpAddress(ip),
      });
      throw new AppError(409, "すでに管理者が登録されています。");
    }

    await recordSecurityAudit({
      actorUserId: user.id,
      eventType: "admin.bootstrap",
      outcome: "success",
      metadata: { email: user.email },
      ipHash: await hashIpAddress(ip),
    });

    return { success: true, email: user.email } as const;
  })
);
