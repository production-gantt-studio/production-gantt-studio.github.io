// provision-initial-admin: creates the one permitted initial Auth account only
// while there are zero global admins. The target email comes exclusively from
// ADMIN_BOOTSTRAP_EMAIL; it is never accepted from the request.
//
// This function closes the bootstrap deadlock caused by shouldCreateUser:false:
// no public signup is allowed, but bootstrap-admin requires an authenticated
// user. Once an admin exists this function permanently returns 409.

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
      // A retry after a transient response may find the same Auth user. This is
      // safe: no role is granted until that user signs in and bootstrap-admin
      // verifies both identity and the zero-admin condition.
      if (!/already|exists|registered/i.test(createError.message)) {
        throw new AppError(500, "初期管理者アカウントを作成できませんでした。");
      }
    }

    await recordSecurityAudit({
      actorUserId: created?.user?.id,
      eventType: "admin.initial_account_provisioned",
      outcome: "success",
      metadata: { email },
      ipHash: await hashIpAddress(ip),
    });

    return { success: true } as const;
  })
);
