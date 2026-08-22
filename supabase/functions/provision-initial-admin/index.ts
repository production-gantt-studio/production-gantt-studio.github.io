// provision-initial-admin: creates and immediately promotes the one permitted
// initial Auth account while there are zero global admins. The target email
// comes exclusively from ADMIN_BOOTSTRAP_EMAIL; it is never accepted from the
// request.
//
// This closes the bootstrap deadlock caused by shouldCreateUser:false: no
// public signup is allowed, and the first user must be allowed to create a
// project immediately after their first passwordless sign-in. bootstrap_admin
// still applies its advisory-lock/zero-admin invariant atomically.

import { withHandler } from "../_shared/http.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { AppError, recordSecurityAudit } from "../_shared/db.ts";
import { hashIpAddress } from "../_shared/tokens.ts";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

Deno.serve((req) =>
  withHandler(req, { requireAuth: false }, async ({ ip }) => {
    if (req.method !== "POST") throw new AppError(405, "POSTメソッドだけが利用できます。");

    const configuredEmail = Deno.env.get("ADMIN_BOOTSTRAP_EMAIL");
    if (!configuredEmail) {
      throw new AppError(500, "初期管理者の設定が完了していません。");
    }

    const email = normalizeEmail(configuredEmail);
    const supabase = createServiceRoleClient();

    const { count, error: countError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countError) throw new AppError(500, "管理者の有無を確認できませんでした。");
    if ((count ?? 0) > 0) {
      throw new AppError(409, "すでに初期管理者は作成されています。");
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (createError) {
      // A retry after a transient response may find the same Auth user. This
      // remains safe because only ADMIN_BOOTSTRAP_EMAIL is eligible and the SQL
      // promotion function still succeeds for exactly one first admin.
      if (!/already|exists|registered/i.test(createError.message)) {
        throw new AppError(500, "初期管理者アカウントを作成できませんでした。");
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (profileError || !profile) {
      throw new AppError(500, "初期管理者のプロフィールを確認できませんでした。");
    }

    const { data: promoted, error: promoteError } = await supabase.rpc("bootstrap_admin", {
      target_user_id: profile.id,
    });
    if (promoteError || !promoted) {
      throw new AppError(409, "初期管理者の登録に失敗しました。");
    }

    await recordSecurityAudit({
      actorUserId: profile.id,
      eventType: "admin.initial_admin_provisioned",
      outcome: "success",
      metadata: { email },
      ipHash: await hashIpAddress(ip),
    });

    return { success: true } as const;
  })
);
