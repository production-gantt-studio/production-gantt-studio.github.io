import { describe, expect, it } from "vitest";
import { formatTaskDateRange, normalizeTaskDateFormat } from "./taskDateDisplay";

describe("task date display", () => {
  it("formats an interval in the compact project format", () => {
    expect(formatTaskDateRange("2026-08-20", "2026-08-22", "compact")).toBe("8/20 — 8/22");
  });

  it("adds weekdays or years only when the project format requests them", () => {
    expect(formatTaskDateRange("2026-08-20", "2026-08-20", "weekday")).toBe("8/20(木)");
    expect(formatTaskDateRange("2026-08-20", "2026-08-22", "full")).toBe("2026/8/20 — 2026/8/22");
  });

  it("uses the compact format for old or malformed saved project data", () => {
    expect(normalizeTaskDateFormat(undefined)).toBe("compact");
    expect(normalizeTaskDateFormat("unexpected")).toBe("compact");
  });
});
