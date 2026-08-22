// ONE-TIME MAINTENANCE SCRIPT — NOT an Edge Function, NOT client code, NEVER
// deployed or committed with real values filled in.
//
// Why this script exists: every login uses
// supabase.auth.signInWithOtp({ shouldCreateUser: false }) (see
// client/src/lib/supabaseTrpcShim.ts), which intentionally refuses to create
// a NEW account for an unrecognized email — self-service signup is disabled
// by design (see the security spec in this Phase 2 request). That means the
// very first administrator cannot simply "sign up": someone holding the
// service-role key must provision that one auth account first, exactly once,
// before the admin can ever log in at all. After that, the admin logs in
// normally via the app's email-link screen, and then calls the
// `bootstrap-admin` Edge Function once to promote their own profile to
// role='admin' (see supabase/functions/bootstrap-admin/index.ts and
// supabase/migrations/20260821000012_bootstrap_admin_function.sql — that
// step IS safe to expose as a normal authenticated Edge Function, because it
// only ever succeeds while zero admins exist).
//
// This script does the ONE step that cannot be done through any client-safe
// API: creating that first auth.users row. It must be run by a human with
// direct access to the Supabase project's service-role key (Project
// Settings → API), from a trusted machine — never from this app's runtime,
// never from a CI job, never with the key pasted into chat/logs.
//
// Usage (run once, locally, with Deno installed):
//   SUPABASE_URL=https://<project-ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key, from Project Settings> \
//   ADMIN_EMAIL=<the one admin's real email address> \
//   deno run --allow-net --allow-env scripts/create-initial-admin.ts
//
// It is idempotent: running it again for the same email is a harmless no-op
// (Supabase reports "already registered" and the script exits 0).
//
// IMPORTANT (Manus/Gemini review, Section 2): ADMIN_EMAIL here must be the
// EXACT SAME address configured as the `ADMIN_BOOTSTRAP_EMAIL` Edge Function
// secret (Supabase dashboard → Edge Functions → Secrets). The
// bootstrap-admin Edge Function only ever promotes a caller whose own
// verified login email matches that secret (normalized, exact match) — this
// script's job is only to make sure that email CAN log in at all;
// bootstrap-admin's own email check is the actual authorization boundary.

import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const adminEmail = Deno.env.get("ADMIN_EMAIL");

if (!url || !serviceRoleKey || !adminEmail) {
  console.error(
    "Missing required environment variables. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ADMIN_EMAIL before running this script.",
  );
  Deno.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

const { error } = await supabase.auth.admin.createUser({
  email: adminEmail,
  email_confirm: true, // no confirmation email is sent by this call
});

if (error) {
  const alreadyExists = /already|exists|registered/i.test(error.message ?? "");
  if (alreadyExists) {
    console.log(`OK: an account for ${adminEmail} already exists. Nothing to do.`);
    Deno.exit(0);
  }
  console.error("Failed to create the initial admin account:", error.message);
  Deno.exit(1);
}

console.log(
  `Created a login account for ${adminEmail}. Next step: have that person open the app, log in via the email-link screen, then trigger the "bootstrap-admin" action once — it will succeed only because no admin exists yet.`,
);
