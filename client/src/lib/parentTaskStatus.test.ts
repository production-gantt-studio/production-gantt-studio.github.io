import { describe, expect, it } from "vitest";
import { syncParentTaskStatus } from "./parentTaskStatus";

const tasks = [
  { id: "parent", status: "未着手" },
  { id: "child-a", parentId: "parent", status: "未着手" },
  { id: "child-b", parentId: "parent", status: "未着手" },
];

describe("syncParentTaskStatus", () => {
  it("詳細タスクが進行中になった時、親タスクを進行中へ更新する", () => {
    const updated = syncParentTaskStatus(tasks.map((task) => task.id === "child-a" ? { ...task, status: "進行中" } : task), "child-a");
    expect(updated.find((task) => task.id === "parent")?.status).toBe("進行中");
  });

  it("詳細タスクが修正中になった時も、親タスクを進行中へ更新する", () => {
    const updated = syncParentTaskStatus(tasks.map((task) => task.id === "child-a" ? { ...task, status: "修正中" } : task), "child-a");
    expect(updated.find((task) => task.id === "parent")?.status).toBe("進行中");
  });

  it("詳細タスクがすべて完了した時、親タスクも完了へ更新する", () => {
    const updated = syncParentTaskStatus(tasks.map((task) => task.id === "child-a" || task.id === "child-b" ? { ...task, status: "完了" } : task), "child-b");
    expect(updated.find((task) => task.id === "parent")?.status).toBe("完了");
  });

  it("詳細タスクが一部だけ完了でも、親タスクを自動完了しない", () => {
    const updated = syncParentTaskStatus(tasks.map((task) => task.id === "child-a" ? { ...task, status: "完了" } : task), "child-a");
    expect(updated.find((task) => task.id === "parent")?.status).toBe("未着手");
  });

  it("親タスク自身の変更では状態を更新しない", () => {
    expect(syncParentTaskStatus(tasks, "parent")).toBe(tasks);
  });
});
