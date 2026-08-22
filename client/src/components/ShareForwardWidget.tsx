// Phase 2 follow-up (Manus/Gemini review, Section 5-2 + viewer-share-screen
// requirement): a brand-new, minimal, additive UI surface that lets a
// viewer who arrived via a share URL forward/create a child share link for
// the same project, without logging in — a capability that did not exist
// in the original app at all.
//
// This is intentionally NOT built into Home.tsx's existing share panel
// (workspacePanel === "share"): that panel is for the project's owner/editor
// (list existing links, revoke, etc.) and is already unreachable for a
// share-token viewer (showDetailSettings is false for readOnly/sharedView —
// see lib/accessControl.ts), and Home.tsx/ProjectIndex.tsx/Invite.tsx remain
// under the standing "do not edit" constraint from the original Phase 2
// spec. Building this as a wholly separate, self-mounted overlay — the same
// additive pattern already used for the login prompt in const.ts — satisfies
// both: zero edits to any protected file, and a viewer-facing screen that
// shows ONLY the one action Section 5 mandates ("この案件を共有する") with
// nothing else: no share-link list, no revoke button, no settings, no
// member list, no task editing. Mounted once, globally, in App.tsx; renders
// nothing at all unless the current URL actually carries a `share` query
// param (i.e. the visitor arrived via a share link in the first place).

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toAppUrl } from "@/lib/appUrl";

function currentShareToken(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("share");
}

export default function ShareForwardWidget() {
  const [shareToken, setShareToken] = useState<string | null>(() => currentShareToken());
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const forward = trpc.projects.createForwardedShare.useMutation();

  useEffect(() => {
    // Share links in this app are always full-page-style loads, but this
    // keeps the widget correct if the URL ever changes via client-side
    // navigation (back/forward) too.
    const onNav = () => setShareToken(currentShareToken());
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  if (!shareToken) return null;

  const onCreate = async () => {
    setError(null);
    setResult(null);
    try {
      const res = await forward.mutateAsync({ parentToken: shareToken });
      setResult({ url: toAppUrl(res.shareUrl), expiresAt: res.expiresAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "この共有URLは利用できません。");
    }
  };

  const onCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the URL is
      // still visible and selectable in the input below, so this is a
      // soft-fail, not an error state.
    }
  };

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 2147482000, fontFamily: "inherit" }}>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 999,
            border: "none",
            background: "#3976c7",
            color: "#fff",
            boxShadow: "0 8px 24px rgba(15,23,42,0.25)",
            cursor: "pointer",
          }}
        >
          この案件を共有する
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="この案件を共有する"
          style={{
            width: "min(320px, 90vw)",
            background: "#fff",
            color: "#0f172a",
            borderRadius: 12,
            padding: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>この案件を共有する</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: "#64748b" }}
            >
              ✕
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#475569", margin: "0 0 12px", lineHeight: 1.5 }}>
            あなたが持っているこの案件の閲覧用リンクをもとに、新しい閲覧専用リンクを発行して共有できます。元のリンクが取り消されると、発行したリンクも使えなくなります。
          </p>
          <button
            type="button"
            onClick={onCreate}
            disabled={forward.isPending}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: "#3976c7",
              color: "#fff",
              cursor: forward.isPending ? "wait" : "pointer",
            }}
          >
            {forward.isPending ? "発行中" : "共有用リンクを作成"}
          </button>
          {error && <p style={{ marginTop: 10, fontSize: 12, color: "#c9232d" }}>{error}</p>}
          {result && (
            <div style={{ marginTop: 10 }}>
              <input
                readOnly
                value={result.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="共有用リンク"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px",
                  fontSize: 12,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              />
              <button
                type="button"
                onClick={onCopy}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#0f172a",
                  cursor: "pointer",
                }}
              >
                リンクをコピー
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
