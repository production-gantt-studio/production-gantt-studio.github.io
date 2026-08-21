import { describe, expect, it } from "vitest";
import { reorderTaskGroup } from "./taskReorder";

const tasks = [
  { id: "a", phase: "pre", parentId: null },
  { id: "a-1", phase: "pre", parentId: "a" },
  { id: "b", phase: "pre", parentId: null },
  { id: "d", phase: "production", parentId: null },
  { id: "c", phase: "production", parentId: null },
  { id: "c-1", phase: "production", parentId: "c" },
];

describe("reorderTaskGroup", () => {
  it("親タスクを動かす時は詳細タスクをひとまとまりで追従させる", () => {
    const result = reorderTaskGroup(tasks, "c", "d");
    expect(result.moved).toBe(true);
    expect(result.tasks.map((task) => task.id)).toEqual(["a", "a-1", "b", "c", "c-1", "d"]);
  });

  it("詳細タスクは同じ親の詳細タスク同士でだけ並び替えられる", () => {
    const withSecondChild = [...tasks.slice(0, 2), { id: "a-2", phase: "pre", parentId: "a" }, ...tasks.slice(2)];
    const result = reorderTaskGroup(withSecondChild, "a-2", "a-1");
    expect(result.moved).toBe(true);
    expect(result.tasks.map((task) => task.id)).toEqual(["a", "a-2", "a-1", "b", "d", "c", "c-1"]);
  });

  it("別フェーズ・別階層への移動は拒否する", () => {
    expect(reorderTaskGroup(tasks, "a", "c")).toMatchObject({ moved: false, reason: "different-phase" });
    expect(reorderTaskGroup(tasks, "a", "a-1")).toMatchObject({ moved: false, reason: "different-level" });
  });
});
