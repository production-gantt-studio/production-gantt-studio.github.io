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
    expect(getProjectAccessPresentation({ accountRole: "admin", projectAccessRole: "editor", sharedView: false, invitePreview: false })).toMatchObject({ roleLabel: "管理者", canEditInline: true, showDetailSettings: true });
  });

  it("allows editors to directly edit names and open detailed settings", () => {
    expect(getProjectAccessPresentation({ accountRole: "user", projectAccessRole: "editor", sharedView: false, invitePreview: false })).toMatchObject({ roleLabel: "編集者", canEditInline: true, showDetailSettings: true });
  });

  it("keeps viewers read-only for both project and shared-link views", () => {
    expect(getProjectAccessPresentation({ accountRole: "user", projectAccessRole: "viewer", sharedView: false, invitePreview: false })).toMatchObject({ roleLabel: "閲覧者", canEditInline: false, showDetailSettings: false });
    expect(getProjectAccessPresentation({ accountRole: "admin", projectAccessRole: "editor", sharedView: true, invitePreview: false })).toMatchObject({ roleLabel: "閲覧者", canEditInline: false, showDetailSettings: false });
  });
});
