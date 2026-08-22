// Phase 1 Supabase foundation.
//
// This module is ADDITIVE and UNUSED by the rest of the app in Phase 1 —
// main.tsx, useAuth.ts, and the tRPC provider are untouched, so every
// existing screen keeps running on the current Manus-OAuth + tRPC path
// exactly as before, whether or not VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// are set. Phase 2 is expected to be the first real consumer of this file.
//
// Only the anon/publishable key belongs here (browser-safe by Supabase's own
// design — RLS is what actually protects the data). Never import a service
// role key or DB connection string into anything under client/.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient<Database> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      // PKCE (not the implicit flow, and NOT HashRouter/hash-fragment
      // tokens): the auth code arrives as a `?code=` query param on
      // /auth/callback, which is a normal path-based route under Wouter —
      // see vite.config.ts base + client/src/App.tsx for how that route is
      // registered for GitHub Pages.
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
} else if (import.meta.env.DEV) {
  // Expected in Phase 1: nothing calls getSupabaseClient() yet, so this is
  // informational only, not an error.
  console.info(
    "[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — Supabase features are inactive. This is expected for Phase 1."
  );
}

/**
 * Returns the Supabase client, or null if the env vars are not configured.
 * Callers (Phase 2 and beyond) must handle the null case rather than assume
 * Supabase is always available.
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  return client;
}

/**
 * Phase 2: the data/auth layer genuinely requires Supabase to be configured
 * (unlike Phase 1, which never called this at all). Throws a clear,
 * actionable error rather than silently no-op'ing, so a missing
 * VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY at build time fails loudly
 * instead of behaving like "no one is ever logged in".
 */
export function requireSupabaseClient(): SupabaseClient<Database> {
  if (!client) {
    throw new Error(
      "Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing). Set them at build time — see .env.supabase.example.",
    );
  }
  return client;
}
