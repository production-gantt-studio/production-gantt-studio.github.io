import { verifyAuthenticationResponse } from "jsr:@simplewebauthn/server@13.3.0";
import { withHandler } from "../_shared/http.ts";
import { AppError, recordSecurityAudit } from "../_shared/db.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { PASSKEY_ORIGIN, PASSKEY_RP_ID, parseTransports } from "../_shared/passkeys.ts";
import { hashIpAddress } from "../_shared/tokens.ts";

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

Deno.serve((req) =>
  withHandler(req, { requireAuth: false }, async ({ body, ip }) => {
    if (req.method !== "POST") throw new AppError(405, "POSTメソッドだけが利用できます。");
    if (typeof body.challengeId !== "string" || !body.response || typeof body.response.id !== "string") throw new AppError(400, "Passkeyログインの情報が不足しています。");
    const supabase = createServiceRoleClient();
    const { data: challenge } = await supabase
      .from("passkey_challenges")
      .select("id, challenge")
      .eq("id", body.challengeId)
      .eq("purpose", "authentication")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!challenge) throw new AppError(400, "Passkeyログインの有効期限が切れました。もう一度お試しください。");
    const { data: consumed, error: consumeError } = await supabase
      .from("passkey_challenges")
      .update({ used_at: new Date().toISOString() })
      .eq("id", challenge.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (consumeError || !consumed) throw new AppError(409, "このPasskeyログインはすでに使われています。");

    const { data: credential } = await supabase
      .from("passkey_credentials")
      .select("id, user_id, public_key, counter, transports")
      .eq("credential_id", body.response.id)
      .maybeSingle();
    if (!credential) throw new AppError(403, "このPasskeyは登録されていません。");

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: PASSKEY_ORIGIN,
        expectedRPID: PASSKEY_RP_ID,
        credential: {
          id: body.response.id,
          publicKey: base64UrlToBytes(credential.public_key),
          counter: Number(credential.counter),
          transports: parseTransports(credential.transports),
        },
        requireUserVerification: true,
      });
    } catch {
      await recordSecurityAudit({ actorUserId: credential.user_id, eventType: "passkey.authentication_failed", outcome: "failure", metadata: {}, ipHash: await hashIpAddress(ip) });
      throw new AppError(403, "Passkeyを確認できませんでした。");
    }
    if (!verification.verified) throw new AppError(403, "Passkeyを確認できませんでした。");

    const { data: profile } = await supabase.from("profiles").select("email, role").eq("id", credential.user_id).maybeSingle();
    if (!profile?.email || profile.role !== "admin") throw new AppError(403, "このPasskeyは管理者ログインに利用できません。");
    await supabase.from("passkey_credentials").update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", credential.id);

    const { data: link, error: linkError } = await supabase.auth.admin.generateLink({ type: "magiclink", email: profile.email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) throw new AppError(500, "ログインセッションを発行できませんでした。");
    await recordSecurityAudit({ actorUserId: credential.user_id, eventType: "passkey.authentication_completed", outcome: "success", metadata: {}, ipHash: await hashIpAddress(ip) });
    return { tokenHash, type: "magiclink" };
  }),
);
