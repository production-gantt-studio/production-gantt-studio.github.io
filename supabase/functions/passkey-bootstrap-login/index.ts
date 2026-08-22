import { withHandler } from "../_shared/http.ts";
import { AppError, recordSecurityAudit } from "../_shared/db.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { hashIpAddress, hashOpaqueToken } from "../_shared/tokens.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: false }, async ({ body, ip }) => {
    if (req.method !== "POST") throw new AppError(405, "POSTメソッドだけが利用できます。");
    if (typeof body.token !== "string" || body.token.length < 32) throw new AppError(400, "初回登録リンクが正しくありません。");
    const supabase = createServiceRoleClient();
    const tokenHash = await hashOpaqueToken(body.token);
    const { data: token } = await supabase
      .from("admin_passkey_bootstrap_tokens")
      .select("id, user_id")
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!token) throw new AppError(403, "初回登録リンクは無効または期限切れです。");
    const { data: consumed, error: consumeError } = await supabase
      .from("admin_passkey_bootstrap_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", token.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (consumeError || !consumed) throw new AppError(409, "この初回登録リンクはすでに使われています。");
    const { data: profile } = await supabase.from("profiles").select("email, role").eq("id", token.user_id).maybeSingle();
    if (!profile?.email || profile.role !== "admin") throw new AppError(403, "この初回登録リンクは管理者にだけ使えます。");
    const { data: link, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email: profile.email });
    const tokenHashForSession = link?.properties?.hashed_token;
    if (error || !tokenHashForSession) throw new AppError(500, "初回登録用のセッションを発行できませんでした。");
    await recordSecurityAudit({ actorUserId: token.user_id, eventType: "passkey.bootstrap_completed", outcome: "success", metadata: {}, ipHash: await hashIpAddress(ip) });
    return { tokenHash: tokenHashForSession, type: "magiclink" };
  }),
);
