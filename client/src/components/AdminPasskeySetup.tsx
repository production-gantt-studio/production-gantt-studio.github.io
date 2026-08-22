import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { enrollAdminPasskey, passkeyErrorMessage } from "@/lib/passkeyAuth";

const DISMISSED_KEY = "production-gantt-passkey-prompt-dismissed";

export default function AdminPasskeySetup() {
  const { isAuthenticated, user } = useAuth();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!isAuthenticated || user?.role !== "admin" || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const register = async () => {
    setBusy(true);
    setMessage("");
    try {
      await enrollAdminPasskey();
      localStorage.setItem(DISMISSED_KEY, "1");
      setMessage("この端末のPasskeyを登録しました。次回からメールを待たずにログインできます。");
    } catch (error) {
      setMessage(passkeyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-passkey-setup" aria-live="polite">
      <button className="admin-passkey-close" type="button" aria-label="後で設定する" onClick={dismiss}><X size={15} /></button>
      <KeyRound size={18} />
      <div><b>次回のログインをメール不要にする</b><span>この端末のPasskeyを登録すると、Touch ID・端末PINなどで安全に再ログインできます。</span>{message && <small>{message}</small>}</div>
      <button className="outline-button" type="button" onClick={register} disabled={busy}>{busy ? "確認中" : "この端末に登録"}</button>
    </section>
  );
}
