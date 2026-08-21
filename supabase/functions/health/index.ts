// Phase 1 Edge Function foundation — scaffolding/example only, NOT a
// business-logic endpoint. Proves the shared CORS + JWT-verification harness
// actually works end to end. Phase 2's real functions (invite, share,
// project CRUD, archive) should follow this exact shape.

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getRequestUser } from "../_shared/supabaseClients.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get("origin");
  const user = await getRequestUser(req.headers.get("authorization"));

  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ status: "ok", userId: user.id }), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
