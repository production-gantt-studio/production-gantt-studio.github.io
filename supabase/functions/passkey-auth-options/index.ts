import { generateAuthenticationOptions } from "jsr:@simplewebauthn/server@13.3.0";
import { withHandler } from "../_shared/http.ts";
import { AppError, recordSecurityAudit } from "../_shared/db.ts";
import { createServiceRoleClient } from "../_shared/supabaseClients.ts";
import { PASSKEY_RP_ID } from "../_shared/passkeys.ts";
import { hashIpAddress } from "../_shared/tokens.ts";

Deno.serve((req) =>
  withHandler(req, { requireAuth: false }, async ({ ip }) => {
    if (req.method !== "POST") throw new AppError(405, "POSTメソッドだけが利用できます。");
    const options = await generateAuthenticationOptions({ rpID: PASSKEY_RP_ID, userVerification: "required", allowCredentials: [] });
    const supabase = createServiceRoleClient();
    const { data: challenge, error } = await supabase
      .from("passkey_challenges")
      .insert({ purpose: "authentication", challenge: options.challenge, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
      .select("id")
      .single();
    if (error || !challenge) throw new AppError(500, "Passkeyログインを開始できませんでした。");
    await recordSecurityAudit({ eventType: "passkey.authentication_started", outcome: "success", metadata: {}, ipHash: await hashIpAddress(ip) });
    return { challengeId: challenge.id, options };
  }),
);
