import { AppError } from "./db.ts";

export const PASSKEY_RP_ID = "rikufujita1229-sudo.github.io";
export const PASSKEY_ORIGIN = `https://${PASSKEY_RP_ID}`;
export const PASSKEY_RP_NAME = "Production Gantt Studio";

export function assertPasskeyOrigin(origin: unknown) {
  if (origin !== PASSKEY_ORIGIN) {
    throw new AppError(400, "Passkeyの利用元が正しくありません。");
  }
}

export function randomBase64Url(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function parseTransports(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
