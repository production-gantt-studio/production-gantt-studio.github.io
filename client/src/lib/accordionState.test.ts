import { describe, expect, it } from "vitest";
import { isAccordionExpanded, toggleAccordionId } from "./accordionState";

describe("accordion state", () => {
  it("keeps every section expanded when a project has no saved collapse state", () => {
    expect(isAccordionExpanded(undefined, "production")).toBe(true);
    expect(isAccordionExpanded([], "production")).toBe(true);
  });

  it("toggles only the requested section and preserves other collapsed sections", () => {
    expect(toggleAccordionId([], "production")).toEqual(["production"]);
    expect(toggleAccordionId(["pre", "production"], "production")).toEqual(["pre"]);
  });
});
