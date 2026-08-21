import { describe, expect, it } from "vitest";
import { insertItemAfter } from "./phaseEditing";

describe("insertItemAfter", () => {
  it("inserts a new phase immediately after the selected phase", () => {
    const phases = [{ id: "pre" }, { id: "production" }, { id: "post" }];
    expect(insertItemAfter(phases, { id: "review" }, "production").map((phase) => phase.id)).toEqual(["pre", "production", "review", "post"]);
  });

  it("appends when the selected phase no longer exists", () => {
    expect(insertItemAfter([{ id: "pre" }], { id: "review" }, "missing").map((phase) => phase.id)).toEqual(["pre", "review"]);
  });
});
