import { describe, expect, it } from "vitest";
import { getAssignedOpenTasks } from "./assignedTasks";

const tasks = [
  { id: "t-1", assignee: "山本", status: "進行中", end: "2026-08-20" },
  { id: "t-2", assignee: "山本", status: "未着手", end: "2026-09-20" },
  { id: "t-3", assignee: "山本", status: "完了", end: "2026-08-21" },
  { id: "t-4", assignee: "山本", status: "未着手", end: "2026-08-20", isUnscheduled: true },
  { id: "t-5", assignee: "佐藤", status: "進行中", end: "2026-08-21" },
];

describe("assigned open tasks", () => {
  it("includes future unfinished work instead of only deadline alerts", () => {
    expect(getAssignedOpenTasks(tasks, "山本", "2026-08-20", "all").map((task) => task.id)).toEqual(["t-1", "t-2", "t-4"]);
  });

  it("keeps day and week views separate from unscheduled work", () => {
    expect(getAssignedOpenTasks(tasks, "山本", "2026-08-20", "today").map((task) => task.id)).toEqual(["t-1"]);
    expect(getAssignedOpenTasks(tasks, "山本", "2026-08-20", "unscheduled").map((task) => task.id)).toEqual(["t-4"]);
  });
});
