import { describe, expect, it } from "vitest";
import { isShareLinkUnusable } from "./shareLinkState";

const base = { shareToken: "tok", isError: false, isSuccess: false, hasProject: false };

describe("isShareLinkUnusable", () => {
  it("is false when the URL carries no share token at all", () => {
    expect(isShareLinkUnusable({ ...base, shareToken: null, isError: true })).toBe(false);
  });

  it("is false while the preview is still loading", () => {
    expect(isShareLinkUnusable(base)).toBe(false);
  });

  it("is true when the preview request failed (revoked or expired token)", () => {
    expect(isShareLinkUnusable({ ...base, isError: true })).toBe(true);
  });

  it("is true when the preview resolved without a project", () => {
    expect(isShareLinkUnusable({ ...base, isSuccess: true, hasProject: false })).toBe(true);
  });

  it("is false for a valid share link", () => {
    expect(isShareLinkUnusable({ ...base, isSuccess: true, hasProject: true })).toBe(false);
  });
});
