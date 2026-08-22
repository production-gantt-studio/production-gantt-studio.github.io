// Phase 2 shared: opaque token generation/hashing using the Web Crypto API
// (Deno's runtime, no npm dependency needed). Mirrors server/securityTokens.ts
// exactly — same token shape (32 random bytes, base64url) and same hash
// algorithm (SHA-256 hex) — so the security properties (unguessable token,
// only its hash ever stored) carry over unchanged from the original design.

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashOpaqueToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

// HMAC-SHA256(JWT_SECRET, ip) — mirrors hashIpAddress in server/securityTokens.ts.
// Used only to fingerprint an IP for audit logs without storing it in the
// clear. Returns null if no IP or no secret is available (never throws —
// audit logging must never fail the underlying operation).
export async function hashIpAddress(ip: string | null | undefined): Promise<string | null> {
  const secret = Deno.env.get("AUDIT_IP_HASH_SECRET");
  if (!ip || !secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return toHex(new Uint8Array(signature));
}
