// Phase 1 Edge Function foundation: shared CORS handling.
// Business-logic functions (invite, share, project CRUD, etc.) are Phase 2 —
// this file only exists so Phase 2 functions have a correct, already-tested
// CORS/origin pattern to import instead of each reinventing it.

/**
 * Allowed origins, read from the ALLOWED_ORIGINS Edge Function secret
 * (comma-separated). Set via `supabase secrets set ALLOWED_ORIGINS=...` —
 * never hardcode production/staging URLs here.
 *
 * Expected value once Phase 2 wires up real deployments, e.g.:
 *   ALLOWED_ORIGINS=https://production-gantt-studio.example,http://localhost:5173
 */
function allowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowed = allowedOrigins();
  const allowOrigin = requestOrigin && allowed.includes(requestOrigin) ? requestOrigin : "";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

/**
 * Call at the top of every function. Returns a Response for CORS preflight
 * (OPTIONS) requests, or null if the caller should continue handling the
 * request normally.
 */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}
