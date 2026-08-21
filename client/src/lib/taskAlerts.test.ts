import { describe, expect, it } from "vitest";
import { buildTaskAlerts } from "./taskAlerts";

const base = { id: "t1", name: "確認作業", end: "2026-08-20", assignee: "佐藤", status: "未着手" };

describe("screen task alerts", () => {
  it("prioritizes missing owners before overdue and due-soon tasks", () => {
    const alerts = buildTaskAlerts([{ ...base, id: "due" }, { ...base, id: "late", end: "2026-08-18" }, { ...base, id: "missing", assignee: "" }], "2026-08-20");
    expect(alerts.map((alert) => alert.type)).toEqual(["担当者未設定", "期限超過", "期限接近"]);
  });

  it("includes the current responsible person in deadline alerts", () => {
    expect(buildTaskAlerts([base], "2026-08-20")[0]).toMatchObject({ type: "期限接近", assignee: "佐藤" });
  });

  it("does not alert completed tasks", () => {
    expect(buildTaskAlerts([{ ...base, status: "完了" }], "2026-08-20")).toEqual([]);
  });
});
