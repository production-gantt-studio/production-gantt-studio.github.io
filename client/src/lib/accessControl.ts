export type AccountRole = "admin" | "user" | undefined;
export type ProjectAccessRole = "owner" | "editor" | "viewer" | undefined;

export function canStartProjectCreation(isAuthenticated: boolean, accountRole: AccountRole): boolean {
  return !isAuthenticated || accountRole === "admin";
}

/**
 * 画面に出す権限の状態。役割は3通りしかない。
 *
 *   1. 共有リンク・招待プレビュー(sharedView / invitePreview)
 *      ログイン不要で見るだけ。何も変更できない。
 *   2. 進行メンバー(projectAccessRole === "viewer")
 *      ログインして参加した人。変更できるのは「タスクの状態」と「タスクの担当者」だけ。
 *      タスクの追加・削除・日程変更・案件設定・招待・共有リンク発行はできない。
 *      サーバー側の実体は supabase/functions/update-task-progress/index.ts。
 *   3. 編集者・管理者(owner / editor / admin、および未ログインの手元データ)
 *      すべて編集できる。
 *
 * readOnly は「全体を編集できるか」を表す旧来の意味のまま残してある(タスク追加や
 * 日程変更など、進行メンバーに許していない操作の分岐がこれを見ている)。
 * 進行メンバーに許した2項目は canEditTaskProgress で判定する。
 */
export function getProjectAccessPresentation(input: { accountRole: AccountRole; projectAccessRole: ProjectAccessRole; sharedView: boolean; invitePreview: boolean }) {
  // リンクで見ているだけの人。ログインしておらず、案件一覧も持たない。
  const linkOnlyView = input.sharedView || input.invitePreview;
  // 進行メンバー。ログイン済みで、状態と担当者だけ変更できる。
  const progressOnly = !linkOnlyView && input.projectAccessRole === "viewer";

  const readOnly = linkOnlyView || progressOnly;
  const roleLabel = linkOnlyView ? "閲覧者" : progressOnly ? "進行メンバー" : input.accountRole === "admin" || input.projectAccessRole === "owner" ? "管理者" : "編集者";
  const roleDescription =
    roleLabel === "管理者"
      ? "案件作成・招待・編集ができます"
      : roleLabel === "編集者"
        ? "タスクと日程を編集できます"
        : roleLabel === "進行メンバー"
          ? "タスクの状態と担当者を変更できます"
          : "内容を閲覧できます";

  return {
    readOnly,
    linkOnlyView,
    progressOnly,
    roleLabel,
    roleDescription,
    canEditInline: !readOnly,
    // 進行メンバーに開放する2項目(状態・担当者)。編集者・管理者はもちろん使える。
    canEditTaskProgress: !readOnly || progressOnly,
    showDetailSettings: !readOnly,
  };
}
