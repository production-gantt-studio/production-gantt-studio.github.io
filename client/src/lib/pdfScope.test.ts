import { describe, expect, it } from "vitest";
import { selectPdfScopeTasks } from "./pdfScope";

const tasks = [
  { id: "pre-1", phase: "pre" },
  { id: "pre-2", phase: "pre" },
  { id: "post-1", phase: "post" },
];

describe("selectPdfScopeTasks", () => {
  it("includes every task for the full-project PDF", () => {
    expect(selectPdfScopeTasks(tasks, "all", "all", [])).toEqual(tasks);
  });

  it("includes only the active phase for the phase PDF", () => {
    expect(selectPdfScopeTasks(tasks, "phase", "pre", [])).toEqual(tasks.slice(0, 2));
  });

  it("includes only checked task rows for the selected-task PDF", () => {
    expect(selectPdfScopeTasks(tasks, "selected", "all", ["pre-2", "post-1"])).toEqual([tasks[1], tasks[2]]);
  });
});
