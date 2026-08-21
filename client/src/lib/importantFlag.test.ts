import { describe, expect, it } from "vitest";
import { toggleImportantFlag } from "./importantFlag";

describe("important flag", () => {
  it("updates only the selected task and preserves the other tasks", () => {
    const tasks = [{ id: "shoot", isImportant: false }, { id: "edit", isImportant: true }];
    expect(toggleImportantFlag(tasks, "shoot")).toEqual([{ id: "shoot", isImportant: true }, { id: "edit", isImportant: true }]);
  });

  it("turns an already important task back off", () => {
    expect(toggleImportantFlag([{ id: "show", isImportant: true }], "show")).toEqual([{ id: "show", isImportant: false }]);
  });
});
