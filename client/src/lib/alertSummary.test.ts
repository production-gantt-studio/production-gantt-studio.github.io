import { describe, expect, it } from "vitest";
import { summarizeAlerts } from "./alertSummary";

describe("summarizeAlerts", () => {
  it("期限超過・未担当・期限接近を優先情報として要約する", () => {
    expect(summarizeAlerts([{ type: "期限超過" }, { type: "担当者未設定" }, { type: "期限接近" }])).toEqual({
      hasUrgent: true,
      label: "期限超過 1件・未担当 1件・期限接近 1件",
    });
  });

  it("重要タスクだけでは通常時にアラートを展開しない", () => {
    expect(summarizeAlerts([{ type: "重要タスク" }])).toEqual({ hasUrgent: false, label: "確認事項 1件" });
  });
});
