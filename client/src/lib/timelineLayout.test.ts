import { describe, expect, it } from "vitest";
import { clampTaskColumnWidth, DAY_UNIT_WIDTH, getTimelineDisplayMetrics, MONTH_DAY_UNIT_WIDTH, TASK_COLUMN_MAX_WIDTH, TASK_COLUMN_MIN_WIDTH, WEEK_UNIT_WIDTH } from "./timelineLayout";

describe("timeline layout", () => {
  it("uses one calendar unit per day in daily view", () => {
    expect(getTimelineDisplayMetrics("days", 15)).toEqual({ daysPerUnit: 1, unitWidth: DAY_UNIT_WIDTH, unitCount: 15 });
  });

  it("groups a partial range into calendar weeks in weekly view", () => {
    expect(getTimelineDisplayMetrics("weeks", 15)).toEqual({ daysPerUnit: 7, unitWidth: WEEK_UNIT_WIDTH, unitCount: 3 });
  });

  it("keeps daily positions while compacting a long monthly view", () => {
    expect(getTimelineDisplayMetrics("months", 31)).toEqual({ daysPerUnit: 1, unitWidth: MONTH_DAY_UNIT_WIDTH, unitCount: 31 });
  });

  it("keeps the task column within a readable range", () => {
    expect(clampTaskColumnWidth(120)).toBe(TASK_COLUMN_MIN_WIDTH);
    expect(clampTaskColumnWidth(900)).toBe(TASK_COLUMN_MAX_WIDTH);
  });
});
