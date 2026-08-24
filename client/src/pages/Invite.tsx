import { useEffect } from "react";
import { Loader2, LogIn, UserRoundCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

const PENDING_INVITE_KEY = "production-gantt-pending-invite";

/**
 * 招待リンクを開いた画面。
 *
 * 2026-08-24 変更: 役割によらず「ログイン → 招待を受諾 → 案件へ」の1本道にした。
 * 以前は閲覧者だけログインせずプレビュー画面へ飛ばしていたが、進行メンバーは
 * タスクの状態と担当者を変更できるようになったため、誰が変更したのか分からない
 * まま書き込ませるわけにはいかない。ログイン不要で見せたい相手には、招待ではなく
 * 共有リンク(案件画面の「7日間の閲覧リンクを発行」)を渡す。
 */
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
    if (!isAuthenticated || !preview.data || accept.isPending || accept.isSuccess) return;
    accept.mutate({ token });
  }, [isAuthenticated, preview.data?.role, token]);

  if (!token) return <main className="studio-shell invite-shell"><section className="invite-card"><h1>招待リンクが見つかりません</h1><p>招待メール内のリンクをもう一度開いてください。</p><button className="outline-button" onClick={() => setLocation("/")}>案件管理へ戻る</button></section></main>;
  if (loading || preview.isLoading) return <main className="studio-shell invite-shell"><section className="invite-card"><Loader2 className="animate-spin" /><p>招待内容を確認しています。</p></section></main>;
  if (preview.isError || !preview.data) return <main className="studio-shell invite-shell"><section className="invite-card"><h1>この招待リンクは利用できません</h1><p>リンクが無効、または招待が取り消されています。</p><button className="outline-button" onClick={() => setLocation("/")}>案件管理へ戻る</button></section></main>;

  const isProgressMember = preview.data.role === "viewer";
  const heading = isProgressMember ? "進行メンバーとして招待されています" : "編集者として招待されています";
  const description = isProgressMember
    ? "招待されたメールアドレスでログインすると、この案件のタスクの「状態」と「担当者」を変更できます。タスクの追加・削除や日程の変更はできません。"
    : "招待されたメールアドレスでログインすると、この案件を編集できます。";

  return <main className="studio-shell invite-shell"><section className="invite-card"><span className="eyebrow"><i className="eyebrow-line" />PROJECT INVITATION</span><UserRoundCheck size={28} /><h1>{heading}</h1><p>{description}</p><button className="signal-button" disabled={accept.isPending} onClick={() => { sessionStorage.setItem(PENDING_INVITE_KEY, token); if (isAuthenticated) accept.mutate({ token }); else startLogin(); }}><LogIn size={16} />{accept.isPending ? "招待を確認中" : isAuthenticated ? "この招待を受ける" : "ログインして招待を受ける"}</button>{accept.isError && <small className="invite-error">招待されたメールアドレスでログインしてください。</small>}</section></main>;
}
