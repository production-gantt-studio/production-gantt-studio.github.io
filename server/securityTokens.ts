import { createHash, createHmac, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function createOpaqueToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashIpAddress(ip: string | undefined) {
  if (!ip) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(ip).digest("hex");
}
