import { describe, expect, it } from "vitest";
import { normalizeInlineName } from "./inlineEditing";

describe("normalizeInlineName", () => {
  it("removes surrounding and repeated whitespace when an inline edit is committed", () => {
    expect(normalizeInlineName("  編集  確認  ", "名称未設定")).toBe("編集 確認");
  });

  it("keeps a readable fallback when an inline edit is left empty", () => {
    expect(normalizeInlineName("   ", "名称未設定")).toBe("名称未設定");
  });
});
