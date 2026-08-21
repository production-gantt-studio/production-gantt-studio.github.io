// Phase 1 Edge Function foundation: Supabase client factories.
//
// Two distinct clients, never confused:
//   - createUserScopedClient(authHeader): acts AS the calling user (their JWT
//     is forwarded), so Postgres RLS applies exactly as it would for any
//     other authenticated request. Use this for anything that should honor
//     the same permission model as direct table access.
//   - createServiceRoleClient(): bypasses RLS entirely. Use this ONLY for the
//     specific pieces of business logic that legitimately need to act beyond
//     what RLS alone can express (admin-only project creation, recent-auth
//     gated deletes, audit logging, cascading deletes, token issuance) — the
//     same logic that lives in server/routers.ts / server/db.ts today.
//
// SUPABASE_SERVICE_ROLE_KEY must be set only as an Edge Function secret
// (`supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`), never as a build-
// time env var, never committed, never sent to any client.

import { createClient } from "npm:@supabase/supabase-js@2";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`[Edge Function] Missing required environment variable: ${name}`);
  return value;
}

export function createServiceRoleClient() {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createUserScopedClient(authHeader: string | null) {
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolve the calling user from their forwarded JWT, or null if the request
 * is unauthenticated / the token is invalid. Use this instead of trusting
 * the Authorization header's presence alone.
 */
export async function getRequestUser(authHeader: string | null) {
  if (!authHeader) return null;
  const supabase = createUserScopedClient(authHeader);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
