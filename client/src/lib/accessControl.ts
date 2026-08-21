export type AccountRole = "admin" | "user" | undefined;
export type ProjectAccessRole = "owner" | "editor" | "viewer" | undefined;

export function getProjectAccessPresentation(input: { accountRole: AccountRole; projectAccessRole: ProjectAccessRole; sharedView: boolean; invitePreview: boolean }) {
  const readOnly = input.sharedView || input.invitePreview || input.projectAccessRole === "viewer";
  const roleLabel = readOnly ? "閲覧者" : input.accountRole === "admin" || input.projectAccessRole === "owner" ? "管理者" : "編集者";
  const roleDescription = roleLabel === "管理者" ? "案件作成・招待・編集ができます" : roleLabel === "編集者" ? "タスクと日程を編集できます" : "内容を閲覧できます";
  return { readOnly, roleLabel, roleDescription, canEditInline: !readOnly, showDetailSettings: !readOnly };
}
