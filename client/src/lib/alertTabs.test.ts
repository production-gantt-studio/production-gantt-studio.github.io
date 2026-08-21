import { describe, expect, it } from "vitest";
import { filterAlertsByTab, getAlertTabs } from "./alertTabs";

describe("alert tabs", () => {
  it("creates tabs from assignees without relying on a login account", () => {
    expect(getAlertTabs(["佐藤", "高橋", "佐藤", "未設定", ""])).toEqual(["all", "佐藤", "高橋", "unassigned"]);
  });

  it("filters an alert list for a selected person", () => {
    const alerts = [
      { assignee: "佐藤", type: "期限接近" },
      { assignee: "高橋", type: "期限超過" },
      { assignee: "担当者を選択してください", type: "担当者未設定" },
    ];
    expect(filterAlertsByTab(alerts, "高橋")).toEqual([alerts[1]]);
    expect(filterAlertsByTab(alerts, "unassigned")).toEqual([alerts[2]]);
  });
});
