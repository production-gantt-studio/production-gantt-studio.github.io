import { describe, expect, it } from "vitest";
import { canStartProjectCreation, getProjectAccessPresentation } from "./accessControl";

describe("canStartProjectCreation", () => {
  it("shows the login entry before authentication and the creation entry only to administrators after authentication", () => {
    expect(canStartProjectCreation(false, undefined)).toBe(true);
    expect(canStartProjectCreation(true, "admin")).toBe(true);
    expect(canStartProjectCreation(true, "user")).toBe(false);
  });
});

describe("getProjectAccessPresentation", () => {
  it("allows administrators to directly edit names and open detailed settings", () => {
    expect(getProjectAccessPresentation({ accountRole: "admin", projectAccessRole: "editor", sharedView: false, invitePreview: false })).toMatchObject({ roleLabel: "管理者", canEditInline: true, canEditTaskProgress: true, showDetailSettings: true, progressOnly: false, linkOnlyView: false });
  });

  it("allows editors to directly edit names and open detailed settings", () => {
    expect(getProjectAccessPresentation({ accountRole: "user", projectAccessRole: "editor", sharedView: false, invitePreview: false })).toMatchObject({ roleLabel: "編集者", canEditInline: true, canEditTaskProgress: true, showDetailSettings: true, progressOnly: false });
  });

  it("進捗担当は状態と担当者だけ変更でき、それ以外の編集はできない", () => {
    const presentation = getProjectAccessPresentation({ accountRole: "user", projectAccessRole: "viewer", sharedView: false, invitePreview: false });
    expect(presentation).toMatchObject({
      roleLabel: "進捗担当",
      roleDescription: "タスクのステータスと担当者を変更できます",
      progressOnly: true,
      linkOnlyView: false,
      readOnly: true,
      canEditInline: false,
      showDetailSettings: false,
      canEditTaskProgress: true,
    });
  });

  it("共有リンク・招待プレビューは状態も担当者も変更できない", () => {
    expect(getProjectAccessPresentation({ accountRole: "user", projectAccessRole: undefined, sharedView: true, invitePreview: false })).toMatchObject({ roleLabel: "閲覧者", linkOnlyView: true, progressOnly: false, canEditInline: false, canEditTaskProgress: false, showDetailSettings: false });
    expect(getProjectAccessPresentation({ accountRole: "user", projectAccessRole: undefined, sharedView: false, invitePreview: true })).toMatchObject({ roleLabel: "閲覧者", linkOnlyView: true, canEditTaskProgress: false });
    // 進捗担当であっても、共有リンク経由で開いている画面では変更させない
    expect(getProjectAccessPresentation({ accountRole: "user", projectAccessRole: "viewer", sharedView: true, invitePreview: false })).toMatchObject({ roleLabel: "閲覧者", linkOnlyView: true, progressOnly: false, canEditTaskProgress: false });
    expect(getProjectAccessPresentation({ accountRole: "admin", projectAccessRole: "editor", sharedView: true, invitePreview: false })).toMatchObject({ roleLabel: "閲覧者", canEditInline: false, canEditTaskProgress: false, showDetailSettings: false });
  });

  it("未ログインの手元データはすべて編集できる", () => {
    expect(getProjectAccessPresentation({ accountRole: undefined, projectAccessRole: undefined, sharedView: false, invitePreview: false })).toMatchObject({ readOnly: false, canEditInline: true, canEditTaskProgress: true });
  });
});
