import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { requireSupabaseClient } from "@/lib/supabaseClient";

type FunctionFailure = { error?: string };

async function callPasskeyFunction<T>(name: string, body: unknown): Promise<T> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    let message = error.message || "Passkeyの処理に失敗しました。";
    try {
      const parsed = await (error as { context?: Response }).context?.clone().json() as FunctionFailure | undefined;
      if (parsed?.error) message = parsed.error;
    } catch {
      // Keep the safe generic message from the function client.
    }
    throw new Error(message);
  }
  return data as T;
}

export function passkeyErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  if (/notallowed|cancel|aborted/i.test(raw)) return "Passkeyの確認が取り消されました。もう一度お試しください。";
  if (/not supported|notavailable|webauthn/i.test(raw)) return "このブラウザではPasskeyを利用できません。対応するChrome、Safari、Edgeで開いてください。";
  return raw || "Passkeyの処理に失敗しました。";
}

export function ensurePasskeySupport() {
  if (!browserSupportsWebAuthn()) throw new Error("このブラウザではPasskeyを利用できません。対応するChrome、Safari、Edgeで開いてください。");
}

export async function enrollAdminPasskey() {
  ensurePasskeySupport();
  const start = await callPasskeyFunction<{ challengeId: string; options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("passkey-register-options", {});
  const response = await startRegistration({ optionsJSON: start.options });
  const result = await callPasskeyFunction<{ verified: boolean }>("passkey-register-verify", { challengeId: start.challengeId, response });
  if (!result.verified) throw new Error("Passkeyを確認できませんでした。");
}

export async function signInWithPasskey() {
  ensurePasskeySupport();
  const start = await callPasskeyFunction<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("passkey-auth-options", {});
  const response = await startAuthentication({ optionsJSON: start.options });
  const result = await callPasskeyFunction<{ tokenHash: string; type: "magiclink" }>("passkey-auth-verify", { challengeId: start.challengeId, response });
  const supabase = requireSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: result.tokenHash, type: result.type });
  if (error) throw error;
}
