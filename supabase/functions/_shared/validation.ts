// Phase 2 shared: request-body validation, ported 1:1 from the zod schemas in
// server/routers.ts (projectInput, inviteInput, shareInput, tokenInput) so
// Edge Functions accept/reject exactly the same shapes the original tRPC
// procedures did.

import { z } from "npm:zod@3";

export const projectInput = z.object({
  title: z.string().trim().min(1).max(255),
  client: z.string().trim().max(255).optional().nullable(),
  eventMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
  // The client still sends/receives this as a JSON *string* (unchanged UI
  // contract) even though Postgres stores it as jsonb — see the shim's
  // JSON.parse/JSON.stringify boundary in client/src/lib/supabaseTrpcShim.ts.
  data: z.string().min(2).max(3_000_000),
});

export const inviteInput = z.object({
  publicId: z.string().min(1).max(64),
  email: z.string().trim().email().max(320),
  role: z.enum(["editor", "viewer"]),
  origin: z.string().url(),
});

export const shareInput = z.object({
  publicId: z.string().min(1).max(64),
  origin: z.string().url(),
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
});

export const tokenInput = z.object({ token: z.string().min(40).max(96) });

export const publicIdInput = z.object({ publicId: z.string().min(1).max(64) });

// create-forwarded-share-link: the ONLY input this function ever accepts is
// the parent share token itself — no publicId, no projectId, no custom
// expiry, no creator id, no other link id. Everything else the function
// needs (project, expiry ceiling, ancestor chain) is derived server-side
// from the parent link row that this token resolves to. See that function's
// own comment for the full list of fixed requirements this narrow input
// shape exists to satisfy.
export const forwardedShareInput = z.object({ parentToken: z.string().min(40).max(96) });

export class ValidationError extends Error {}

export function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => i.message).join(", ") || "入力内容が正しくありません。");
  }
  return result.data;
}
