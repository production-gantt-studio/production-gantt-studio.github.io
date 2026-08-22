// Phase 2: PKCE callback landing page. Supabase's client (created with
// flowType: "pkce", detectSessionInUrl: true — see lib/supabaseClient.ts)
// exchanges the `?code=` query param for a real session automatically as
// part of its own initialization; awaiting getSession() here resolves only
// once that exchange has completed (or failed), so this page just waits for
// that and then routes onward. This is a normal path-based Wouter route
// (registered in App.tsx) — NOT a hash-fragment route — so it resolves
// correctly under GitHub Pages once base/404.html SPA-fallback are in place
// (see vite.config.ts and public/404.html).
//
// Manus/Gemini review note (Section 4): this route now serves TWO distinct
// arrivals, not just one:
//   1. A direct `?code=` PKCE redirect from Supabase Auth — supabase-js's
//      own detectSessionInUrl exchanges the code automatically; getSession()
//      below simply waits for that exchange to finish.
//   2. A follow-on redirect FROM the new /auth/confirm route (see
//      AuthConfirm.tsx), which establishes the session itself via
//      verifyOtp() and only afterwards may send the browser here (or
//      directly onward — /auth/confirm can also route straight to "/" or
//      "/invite" without ever visiting this page at all). In this case
//      there is no `?code=` in the URL at all; getSession() resolves against
//      the session /auth/confirm already created, and this page treats that
//      exactly the same as a successful PKCE exchange — no branching needed,
//      since both cases reduce to "is there a session now, yes or no".
// No behavior changed here versus the pre-review version; only this comment
// (and the error message below) were updated to make the dual-purpose
// nature explicit, since the review specifically asked for this route to
// visibly account for both mechanisms rather than only ever having been
// written with the PKCE case in mind.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { requireSupabaseClient } from "@/lib/supabaseClient";

const PENDING_INVITE_KEY = "production-gantt-pending-invite";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState("ログインを確認しています…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = requireSupabaseClient();
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error || !data.session) {
          setMessage("ログインに失敗しました。リンクの有効期限が切れている可能性があります。もう一度お試しください。");
          return;
        }
        const pendingInvite = sessionStorage.getItem(PENDING_INVITE_KEY);
        setLocation(pendingInvite ? "/invite" : "/");
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : "ログインの確認に失敗しました。");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  return (
    <main className="studio-shell invite-shell">
      <section className="invite-card">
        <p>{message}</p>
      </section>
    </main>
  );
}
