// Phase 2 follow-up (Manus/Gemini review, Section 4): handles Supabase's
// token_hash + type=email OTP-verification flow, triggered by a CUSTOMIZED
// Supabase Auth email template that links directly to THIS route (see
// docs/phase2_supabase_data_layer.md's Auth-configuration notes for the
// exact template change required) instead of Supabase's own default
// {{ .ConfirmationURL }}. This is a DIFFERENT mechanism from the PKCE
// `?code=` exchange that AuthCallback.tsx handles:
//
//   - PKCE (`?code=`): supabase-js's own detectSessionInUrl automatically
//     exchanges the code for a session; AuthCallback.tsx just waits for that.
//   - token_hash + type (this route): the email link encodes an opaque,
//     single-use token_hash directly; this page must explicitly call
//     supabase.auth.verifyOtp({ token_hash, type }) itself — nothing does
//     this automatically.
//
// The review's own reasoning: relying on the PKCE code-exchange path alone
// is fragile against email-security scanners that pre-fetch links before the
// real recipient clicks them (which can consume a single-use PKCE code
// before the user ever sees it); routing the confirmation email at a
// dedicated token_hash/verifyOtp route is the currently-recommended, more
// robust pattern. Both routes are kept — this does not replace
// AuthCallback.tsx, which still exists for the PKCE case and for a visit
// that arrives here first and then continues on to /auth/callback.
//
// A normal path-based Wouter route (registered in App.tsx), NOT a
// hash-fragment route, so it resolves correctly under GitHub Pages once
// base/404.html SPA-fallback are in place (see vite.config.ts and
// public/404.html) — those already restore the full path+query generically,
// so this new route needed no changes there.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { requireSupabaseClient } from "@/lib/supabaseClient";

const PENDING_INVITE_KEY = "production-gantt-pending-invite";

/**
 * Only ever allow a same-origin, path-based redirect target. `next` arrives
 * from a URL query param, which is attacker-influenceable if a confirmation
 * link is ever copied/forwarded/logged somewhere unexpected — it must never
 * be trusted as an absolute URL or a protocol-relative "//host" value.
 */
function safeNextPath(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export default function AuthConfirm() {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState("ログインを確認しています…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const tokenHash = params.get("token_hash");
        const type = params.get("type");
        const next = safeNextPath(params.get("next"));

        if (!tokenHash || !type) {
          setMessage("ログインリンクの形式が正しくありません。もう一度お試しください。");
          return;
        }

        const supabase = requireSupabaseClient();
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "email" | "invite" | "recovery" | "email_change" | "magiclink",
        });
        if (cancelled) return;

        if (error) {
          setMessage("ログインに失敗しました。リンクの有効期限が切れている可能性があります。もう一度お試しください。");
          return;
        }

        const pendingInvite = sessionStorage.getItem(PENDING_INVITE_KEY);
        setLocation(next ?? (pendingInvite ? "/invite" : "/"));
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
