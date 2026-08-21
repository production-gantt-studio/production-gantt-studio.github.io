import { describe, expect, it } from "vitest";
import { toggleBulkSelectionMode } from "./bulkSelection";

describe("bulk selection mode", () => {
  it("starts selection without changing the current selection", () => {
    expect(toggleBulkSelectionMode(false, ["task-1"])).toEqual({ isActive: true, selectedTaskIds: ["task-1"] });
  });

  it("exits selection and clears selected tasks so daily task rows return to normal", () => {
    expect(toggleBulkSelectionMode(true, ["task-1", "task-2"])).toEqual({ isActive: false, selectedTaskIds: [] });
  });
});
