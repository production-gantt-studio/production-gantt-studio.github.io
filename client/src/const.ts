// Phase 2: startLogin() no longer redirects to the old Manus OAuth portal.
// It now opens a small, self-mounted email-link login prompt backed by
// Supabase Auth (signInWithOtp, shouldCreateUser: false — see the security
// spec: self-service signup is intentionally disabled; only an email that
// already has an account — the bootstrapped admin, or anyone provisioned via
// the create-invite Edge Function — can ever receive a working login link).
//
// Every existing call site (`onClick={() => startLogin()}` in
// DashboardLayout.tsx, ProjectIndex.tsx, Invite.tsx, and the redirect effect
// in useAuth.ts) keeps calling this as a plain, argument-less, void function
// — none of those files change. The old OAuth flow could fire-and-forget a
// full-page redirect with no UI of its own; a magic-link flow inherently
// needs an email address first, so this creates its own minimal, isolated UI
// (a fixed-position overlay mounted directly onto document.body) rather than
// requiring every calling screen to grow its own login form.

import { createElement, useState, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { requireSupabaseClient } from "@/lib/supabaseClient";
import { passkeyErrorMessage, signInWithPasskey } from "@/lib/passkeyAuth";

const CONTAINER_ID = "supabase-login-overlay-root";
let mountedRoot: Root | null = null;

function closeOverlay() {
  const container = document.getElementById(CONTAINER_ID);
  if (mountedRoot) {
    mountedRoot.unmount();
    mountedRoot = null;
  }
  container?.remove();
}

function LoginOverlay() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus("sending");
    setMessage("");
    try {
      const supabase = requireSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: false,
          // The production email template sends its token_hash to
          // /auth/confirm, where AuthConfirm explicitly calls verifyOtp().
          // Using that dedicated route avoids relying on a PKCE code surviving
          // mail scanners and a GitHub Pages SPA fallback round trip.
          emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL ?? "/"}auth/confirm`.replace(/([^:])\/\//, "$1/"),
        },
      });
      if (error) {
        setStatus("error");
        setMessage(
          /signup|not allowed|not found/i.test(error.message)
            ? "このメールアドレスはまだ招待・登録されていません。管理者に招待を依頼してください。"
            : error.message,
        );
        return;
      }
      setStatus("sent");
      setMessage("ログイン用のリンクをメールで送信しました。メールを確認してください。");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "ログインの開始に失敗しました。");
    }
  };

  const onPasskeyLogin = async () => {
    setStatus("sending");
    setMessage("");
    try {
      await signInWithPasskey();
      closeOverlay();
      window.location.reload();
    } catch (error) {
      setStatus("error");
      setMessage(passkeyErrorMessage(error));
    }
  };

  return createElement(
    "div",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "ログイン",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.55)",
        fontFamily: "inherit",
      },
    },
    createElement(
      "div",
      {
        style: {
          background: "#fff",
          borderRadius: 12,
          padding: "28px 24px",
          width: "min(360px, 90vw)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          color: "#0f172a",
        },
      },
      createElement("h2", { style: { margin: "0 0 8px", fontSize: 18 } }, "ログイン"),
      createElement(
        "p",
        { style: { margin: "0 0 16px", fontSize: 13, color: "#475569", lineHeight: 1.5 } },
        "登録済みのPasskeyがある場合は、メールを待たずにログインできます。",
      ),
      createElement(
        "button",
        {
          type: "button",
          onClick: onPasskeyLogin,
          disabled: status === "sending",
          style: { width: "100%", padding: "10px 12px", fontSize: 14, fontWeight: 600, borderRadius: 8, border: "1px solid #3976c7", background: "#eef5ff", color: "#235c9e", cursor: status === "sending" ? "wait" : "pointer", marginBottom: 12 },
        },
        status === "sending" ? "確認中" : "Passkeyでログイン",
      ),
      createElement("p", { style: { margin: "0 0 12px", fontSize: 12, color: "#64748b", lineHeight: 1.5 } }, "初めての端末では、管理者から届いた招待リンクで参加してください。"),
      createElement(
        "form",
        { onSubmit },
        createElement("input", {
          type: "email",
          required: true,
          autoFocus: true,
          value: email,
          onChange: (e: any) => setEmail(e.target.value),
          placeholder: "name@example.com",
          "aria-label": "メールアドレス",
          disabled: status === "sending" || status === "sent",
          style: {
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            fontSize: 14,
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            marginBottom: 12,
          },
        }),
        createElement(
          "div",
          { style: { display: "flex", gap: 8 } },
          createElement(
            "button",
            {
              type: "submit",
              disabled: status === "sending" || status === "sent",
              style: {
                flex: 1,
                padding: "10px 12px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                background: "#3976c7",
                color: "#fff",
                cursor: status === "sending" ? "wait" : "pointer",
              },
            },
            status === "sending" ? "送信中" : status === "sent" ? "送信済み" : "ログインリンクを送る",
          ),
          createElement(
            "button",
            {
              type: "button",
              onClick: closeOverlay,
              style: {
                padding: "10px 12px",
                fontSize: 14,
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                cursor: "pointer",
              },
            },
            "閉じる",
          ),
        ),
      ),
      message
        ? createElement(
            "p",
            {
              style: {
                marginTop: 12,
                fontSize: 13,
                color: status === "error" ? "#c9232d" : "#287a5e",
              },
            },
            message,
          )
        : null,
    ),
  );
}

export const startLogin = () => {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) return; // already open — don't stack a second overlay

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  document.body.appendChild(container);
  mountedRoot = createRoot(container);
  mountedRoot.render(createElement(LoginOverlay));
};
