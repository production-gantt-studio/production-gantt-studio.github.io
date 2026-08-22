import { generateRegistrationOptions } from "jsr:@simplewebauthn/server@13.3.0";
import { withHandler } from "../_shared/http.ts";
import { AppError, getProfile, recordSecurityAudit } from "../_shared/db.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { PASSKEY_RP_ID, PASSKEY_RP_NAME, randomBase64Url } from "../_shared/passkeys.ts";
import { hashIpAddress } from "../_shared/tokens.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: true }, async ({ user, ip }) => {
    if (req.method !== "POST") throw new AppError(405, "POSTメソッドだけが利用できます。");
    if (!user) throw new AppError(401, "ログインしてください。");
    const profile = await getProfile(user.id);
    if (!profile || profile.role !== "admin") throw new AppError(403, "Passkeyを登録できるのは管理者だけです。");

    const supabase = createServiceRoleClient();
    const { data: credentials, error: credentialError } = await supabase
      .from("passkey_credentials")
      .select("credential_id, transports, webauthn_user_id")
      .eq("user_id", user.id);
    if (credentialError) throw new AppError(500, "既存のPasskeyを確認できませんでした。");

    const webauthnUserId = credentials?.[0]?.webauthn_user_id ?? randomBase64Url();
    const options = await generateRegistrationOptions({
      rpName: PASSKEY_RP_NAME,
      rpID: PASSKEY_RP_ID,
      userID: new TextEncoder().encode(webauthnUserId),
      userName: profile.email ?? user.email ?? "admin",
      userDisplayName: profile.email ?? user.email ?? "管理者",
      attestationType: "none",
      excludeCredentials: (credentials ?? []).map((credential) => ({
        id: credential.credential_id,
        transports: Array.isArray(credential.transports) ? credential.transports : [],
      })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      supportedAlgorithmIDs: [-7, -257],
    });

    const { data: challenge, error: challengeError } = await supabase
      .from("passkey_challenges")
      .insert({
        purpose: "registration",
        user_id: user.id,
        webauthn_user_id: webauthnUserId,
        challenge: options.challenge,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (challengeError || !challenge) throw new AppError(500, "Passkey登録を開始できませんでした。");

    await recordSecurityAudit({ actorUserId: user.id, eventType: "passkey.registration_started", outcome: "success", metadata: {}, ipHash: await hashIpAddress(ip) });
    return { challengeId: challenge.id, options };
  }),
);
