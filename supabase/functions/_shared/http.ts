// Phase 2 shared: a small request-handling wrapper so every business Edge
// Function gets the same CORS + auth-extraction + error-shape behavior
// without repeating it. Each function still re-verifies auth/role/org/project
// itself on every call (Turn K's explicit requirement) — this wrapper only
// removes boilerplate, never authorization logic itself.
//
// Manus/Gemini review fix (Section 6): "if a doc claims the system records
// everything, the implementation must actually match that." Several denial
// paths were previously silent — a request rejected here for being
// unauthenticated, for failing input validation, or for an unhandled/500
// error never produced a security_audit_logs row at all, even though
// individual business functions already logged their own domain-specific
// denials (wrong role, stale session, etc.). This wrapper now closes that
// gap centrally: unauthenticated rejections, validation failures, and
// failures/unhandled errors are all audit-logged here, once, so no future
// function can accidentally skip it. This does not duplicate the
// domain-specific "denied" entries individual functions already record for
// their own business-rule rejections (those stay exactly as they are, and
// remain more specific/useful than anything generic this wrapper could add).

import { corsHeaders, handlePreflight } from "./cors.ts";
import { getRequestUser } from "./supabaseClients.ts";
import { AppError, recordSecurityAudit } from "./db.ts";
import { ValidationError } from "./validation.ts";
import { hashIpAddress } from "./tokens.ts";

export function jsonResponse(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
  });
}

/**
 * Wraps a handler with: OPTIONS/CORS preflight, JSON body parsing, and
 * uniform error -> HTTP status mapping. `requireAuth: true` (the default)
 * resolves the caller's Supabase user from the forwarded Authorization
 * header and 401s if absent/invalid — every business function needs this
 * except the fully public preview/share-access ones, which still resolve the
 * request IP for audit-log hashing but never require a session.
 */
export async function withHandler(
  req: Request,
  opts: { requireAuth?: boolean },
  handler: (ctx: { user: { id: string; email: string | null } | null; body: any; ip: string | null }) => Promise<unknown>,
): Promise<Response> {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const requireAuth = opts.requireAuth ?? true;
  const authHeader = req.headers.get("authorization");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const functionName = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "unknown";
  let resolvedUserId: string | null = null;

  try {
    const user = await getRequestUser(authHeader);
    resolvedUserId = user?.id ?? null;

    if (requireAuth && !user) {
      await recordSecurityAudit({
        eventType: "edge_function.unauthenticated",
        outcome: "denied",
        metadata: { function: functionName },
        ipHash: await hashIpAddress(ip),
      });
      return jsonResponse(req, 401, { error: "ログインしてください。" });
    }

    let body: any = {};
    if (req.method !== "GET" && req.method !== "HEAD") {
      const text = await req.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          await recordSecurityAudit({
            actorUserId: resolvedUserId,
            eventType: "edge_function.malformed_request",
            outcome: "denied",
            metadata: { function: functionName },
            ipHash: await hashIpAddress(ip),
          });
          return jsonResponse(req, 400, { error: "リクエストの形式が正しくありません。" });
        }
      }
    } else {
      body = Object.fromEntries(new URL(req.url).searchParams.entries());
    }

    const result = await handler({
      user: user ? { id: user.id, email: user.email ?? null } : null,
      body,
      ip,
    });
    return jsonResponse(req, 200, result);
  } catch (error) {
    const ipHash = await hashIpAddress(ip);

    if (error instanceof AppError) {
      if (error.status >= 500) {
        await recordSecurityAudit({
          actorUserId: resolvedUserId,
          eventType: "edge_function.error",
          outcome: "failure",
          metadata: { function: functionName, status: error.status, message: error.message },
          ipHash,
        });
      }
      return jsonResponse(req, error.status, { error: error.message });
    }
    if (error instanceof ValidationError) {
      await recordSecurityAudit({
        actorUserId: resolvedUserId,
        eventType: "edge_function.validation_error",
        outcome: "denied",
        metadata: { function: functionName, message: error.message },
        ipHash,
      });
      return jsonResponse(req, 400, { error: error.message });
    }

    console.error("[Edge Function] unhandled error:", error);
    await recordSecurityAudit({
      actorUserId: resolvedUserId,
      eventType: "edge_function.unhandled_error",
      outcome: "failure",
      metadata: { function: functionName, message: error instanceof Error ? error.message : String(error) },
      ipHash,
    });
    return jsonResponse(req, 500, { error: "サーバーエラーが発生しました。" });
  }
}
