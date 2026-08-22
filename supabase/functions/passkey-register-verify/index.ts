import { verifyRegistrationResponse } from "jsr:@simplewebauthn/server@13.3.0";
import { withHandler } from "../_shared/http.ts";
import { AppError, getProfile, recordSecurityAudit } from "../_shared/db.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { bytesToBase64Url, parseTransports, PASSKEY_ORIGIN, PASSKEY_RP_ID } from "../_shared/passkeys.ts";
import { hashIpAddress } from "../_shared/tokens.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, body, ip }) => {
    if (req.method !== "POST") throw new AppError(405, "POSTメソッドだけが利用できます。");
    if (!user || typeof body.challengeId !== "string" || !body.response) throw new AppError(400, "Passkey登録の情報が不足しています。");
    const profile = await getProfile(user.id);
    if (!profile || profile.role !== "admin") throw new AppError(403, "Passkeyを登録できるのは管理者だけです。");

    const supabase = createServiceRoleClient();
    const { data: challenge } = await supabase
      .from("passkey_challenges")
      .select("id, challenge, webauthn_user_id")
      .eq("id", body.challengeId)
      .eq("purpose", "registration")
      .eq("user_id", user.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!challenge) throw new AppError(400, "Passkey登録の有効期限が切れました。もう一度お試しください。");

    const { data: consumed, error: consumeError } = await supabase
      .from("passkey_challenges")
      .update({ used_at: new Date().toISOString() })
      .eq("id", challenge.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (consumeError || !consumed) throw new AppError(409, "このPasskey登録はすでに使われています。");

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: PASSKEY_ORIGIN,
        expectedRPID: PASSKEY_RP_ID,
        requireUserVerification: true,
      });
    } catch {
      await recordSecurityAudit({ actorUserId: user.id, eventType: "passkey.registration_failed", outcome: "failure", metadata: {}, ipHash: await hashIpAddress(ip) });
      throw new AppError(400, "Passkeyを確認できませんでした。");
    }
    if (!verification.verified || !verification.registrationInfo) throw new AppError(400, "Passkeyを確認できませんでした。");

    const info = verification.registrationInfo;
    const { error: insertError } = await supabase.from("passkey_credentials").insert({
      user_id: user.id,
      webauthn_user_id: challenge.webauthn_user_id,
      credential_id: info.credential.id,
      public_key: bytesToBase64Url(info.credential.publicKey),
      counter: info.credential.counter,
      transports: parseTransports(info.credential.transports),
      device_type: info.credentialDeviceType,
      backed_up: info.credentialBackedUp,
    });
    if (insertError) throw new AppError(409, "このPasskeyはすでに登録されています。");

    await recordSecurityAudit({ actorUserId: user.id, eventType: "passkey.registration_completed", outcome: "success", metadata: { deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp }, ipHash: await hashIpAddress(ip) });
    return { verified: true };
  }),
);
