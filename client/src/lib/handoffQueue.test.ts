import { describe, expect, it } from "vitest";
import { acknowledgeHandoff, appendHandoff, getPendingHandoffs, type HandoffRecord } from "./handoffQueue";

const records: HandoffRecord[] = [
  { id: "h-1", taskId: "t-1", taskName: "撮影準備", previousAssignee: "佐藤", nextAssignee: "山本", dueDate: "2026-08-26", isUnscheduled: false, changedBy: "佐藤", createdAt: "2026-08-20T09:00:00.000Z" },
  { id: "h-2", taskId: "t-2", taskName: "初稿確認", previousAssignee: "高橋", nextAssignee: "川村", dueDate: "2026-08-27", isUnscheduled: false, changedBy: "高橋", createdAt: "2026-08-20T10:00:00.000Z", acknowledgedAt: "2026-08-20T10:05:00.000Z" },
  { id: "h-3", taskId: "t-3", taskName: "MA", previousAssignee: "山本", nextAssignee: "佐藤", dueDate: "2026-09-01", isUnscheduled: false, changedBy: "山本", createdAt: "2026-08-20T11:00:00.000Z" },
];

describe("handoff queue", () => {
  it("keeps every unacknowledged handoff and sorts the newest first", () => {
    expect(getPendingHandoffs(records).map((record) => record.id)).toEqual(["h-3", "h-1"]);
  });

  it("acknowledges only the selected handoff", () => {
    const updated = acknowledgeHandoff(records, "h-1", "2026-08-20T12:00:00.000Z");
    expect(getPendingHandoffs(updated).map((record) => record.id)).toEqual(["h-3"]);
    expect(updated.find((record) => record.id === "h-2")?.acknowledgedAt).toBe("2026-08-20T10:05:00.000Z");
  });

  it("keeps three consecutive reassignments visible and removes only the handoff confirmed by the editor", () => {
    const consecutiveChanges: HandoffRecord[] = [
      { id: "h-11", taskId: "t-11", taskName: "香盤確認", previousAssignee: "佐藤", nextAssignee: "山本", dueDate: "2026-08-26", isUnscheduled: false, changedBy: "佐藤", createdAt: "2026-08-20T13:00:00.000Z" },
      { id: "h-12", taskId: "t-12", taskName: "ロケハン", previousAssignee: "高橋", nextAssignee: "川村", dueDate: "2026-08-27", isUnscheduled: false, changedBy: "高橋", createdAt: "2026-08-20T13:01:00.000Z" },
      { id: "h-13", taskId: "t-13", taskName: "仮編集", previousAssignee: "山本", nextAssignee: "佐藤", dueDate: "2026-08-28", isUnscheduled: false, changedBy: "山本", createdAt: "2026-08-20T13:02:00.000Z" },
    ];

    expect(getPendingHandoffs(consecutiveChanges).map((record) => record.id)).toEqual(["h-13", "h-12", "h-11"]);

    const afterOneAcknowledgement = acknowledgeHandoff(consecutiveChanges, "h-12", "2026-08-20T13:03:00.000Z");
    expect(getPendingHandoffs(afterOneAcknowledgement).map((record) => record.id)).toEqual(["h-13", "h-11"]);
    expect(afterOneAcknowledgement.find((record) => record.id === "h-12")?.acknowledgedAt).toBe("2026-08-20T13:03:00.000Z");
  });

  it("does not alter already acknowledged or unrelated handoffs when confirming a later change", () => {
    const updated = acknowledgeHandoff(records, "h-3", "2026-08-20T12:30:00.000Z");
    expect(updated.find((record) => record.id === "h-1")?.acknowledgedAt).toBeUndefined();
    expect(updated.find((record) => record.id === "h-2")?.acknowledgedAt).toBe("2026-08-20T10:05:00.000Z");
    expect(updated.find((record) => record.id === "h-3")?.acknowledgedAt).toBe("2026-08-20T12:30:00.000Z");
  });

  it("records every consecutive reassignment in creation order before the queue is displayed", () => {
    const first = appendHandoff([], { id: "h-21", taskId: "t-21", taskName: "撮影準備", previousAssignee: "佐藤", nextAssignee: "山本", dueDate: "2026-08-26", isUnscheduled: false, changedBy: "佐藤", createdAt: "2026-08-20T14:00:00.000Z", acknowledgedAt: null });
    const second = appendHandoff(first, { id: "h-22", taskId: "t-22", taskName: "香盤確認", previousAssignee: "高橋", nextAssignee: "川村", dueDate: "2026-08-27", isUnscheduled: false, changedBy: "高橋", createdAt: "2026-08-20T14:01:00.000Z", acknowledgedAt: null });
    const third = appendHandoff(second, { id: "h-23", taskId: "t-23", taskName: "仮編集", previousAssignee: "山本", nextAssignee: "佐藤", dueDate: "2026-08-28", isUnscheduled: false, changedBy: "山本", createdAt: "2026-08-20T14:02:00.000Z", acknowledgedAt: null });

    expect(third.map((record) => record.id)).toEqual(["h-23", "h-22", "h-21"]);
    expect(getPendingHandoffs(third).map((record) => record.id)).toEqual(["h-23", "h-22", "h-21"]);
  });
});
