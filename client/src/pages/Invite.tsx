import { useEffect } from "react";
import { Eye, Loader2, LogIn, UserRoundCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

const PENDING_INVITE_KEY = "production-gantt-pending-invite";

export default function Invite() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? sessionStorage.getItem(PENDING_INVITE_KEY) ?? "";
  const { isAuthenticated, loading } = useAuth();
  const preview = trpc.projects.invitePreview.useQuery({ token }, { enabled: Boolean(token) });
  const accept = trpc.projects.acceptInvite.useMutation({
    onSuccess: ({ publicId }) => {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      setLocation(`/project?id=${encodeURIComponent(publicId)}`);
    },
  });

  useEffect(() => {
    if (!isAuthenticated || preview.data?.role !== "editor" || accept.isPending || accept.isSuccess) return;
    accept.mutate({ token });
  }, [isAuthenticated, preview.data?.role, token]);

  if (!token) return <main className="studio-shell invite-shell"><section className="invite-card"><h1>招待リンクが見つかりません</h1><p>招待メール内のリンクをもう一度開いてください。</p><button className="outline-button" onClick={() => setLocation("/")}>案件管理へ戻る</button></section></main>;
  if (loading || preview.isLoading) return <main className="studio-shell invite-shell"><section className="invite-card"><Loader2 className="animate-spin" /><p>招待内容を確認しています。</p></section></main>;
  if (preview.isError || !preview.data) return <main className="studio-shell invite-shell"><section className="invite-card"><h1>この招待リンクは利用できません</h1><p>リンクが無効、または招待が取り消されています。</p><button className="outline-button" onClick={() => setLocation("/")}>案件管理へ戻る</button></section></main>;

  const isViewer = preview.data.role === "viewer";
  return <main className="studio-shell invite-shell"><section className="invite-card"><span className="eyebrow"><i className="eyebrow-line" />PROJECT INVITATION</span>{isViewer ? <Eye size={28} /> : <UserRoundCheck size={28} />}<h1>{isViewer ? "閲覧者として招待されています" : "編集者として招待されています"}</h1><p>{isViewer ? "この案件のガント、タスク、日程を閲覧できます。編集はできません。" : "招待されたメールアドレスでログインすると、この案件を編集できます。"}</p>{isViewer ? <button className="signal-button" onClick={() => setLocation(`/project?invite=${encodeURIComponent(token)}`)}><Eye size={16} />閲覧を開始</button> : <button className="signal-button" disabled={accept.isPending} onClick={() => { sessionStorage.setItem(PENDING_INVITE_KEY, token); if (isAuthenticated) accept.mutate({ token }); else startLogin(); }}><LogIn size={16} />{accept.isPending ? "招待を確認中" : isAuthenticated ? "この招待を受ける" : "ログインして招待を受ける"}</button>}{accept.isError && <small className="invite-error">招待されたメールアドレスでログインしてください。</small>}</section></main>;
}
