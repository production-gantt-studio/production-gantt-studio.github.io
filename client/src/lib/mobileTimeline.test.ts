import { describe, expect, it } from "vitest";
import {
  buildOverviewTicks,
  buildWeekTicks,
  countDays,
  dayCenterPercent,
  dayStartPercent,
  formatRangeLabel,
  getBarPlacement,
  getScheduledRange,
  getWeekRange,
  isWithinRange,
  makeRange,
  overlapsRange,
} from "./mobileTimeline";

describe("makeRange", () => {
  it("counts both ends as days", () => {
    expect(makeRange("2026-09-01", "2026-09-01").totalDays).toBe(1);
    expect(makeRange("2026-09-01", "2026-09-30").totalDays).toBe(30);
  });

  it("never produces a range shorter than a day", () => {
    expect(makeRange("2026-09-10", "2026-09-01")).toEqual({ start: "2026-09-10", end: "2026-09-10", totalDays: 1 });
  });
});

describe("getScheduledRange", () => {
  it("spans the first start and the last end", () => {
    const range = getScheduledRange(
      [
        { start: "2026-09-04", end: "2026-09-08" },
        { start: "2026-09-01", end: "2026-09-02" },
        { start: "2026-09-20", end: "2026-09-29" },
      ],
      "2026-08-23",
    );
    expect(range).toEqual({ start: "2026-09-01", end: "2026-09-29", totalDays: 29 });
  });

  it("ignores tasks with no schedule", () => {
    const range = getScheduledRange(
      [
        { start: "2026-09-01", end: "2026-09-02" },
        { start: "2020-01-01", end: "2030-01-01", isUnscheduled: true },
      ],
      "2026-08-23",
    );
    expect(range.start).toBe("2026-09-01");
    expect(range.end).toBe("2026-09-02");
  });

  it("falls back to a single day when nothing is scheduled", () => {
    expect(getScheduledRange([], "2026-08-23")).toEqual({ start: "2026-08-23", end: "2026-08-23", totalDays: 1 });
  });
});

describe("percent placement", () => {
  const range = makeRange("2026-09-01", "2026-09-10");

  it("places the first day at the left edge and stays inside the box", () => {
    expect(dayStartPercent(range, "2026-09-01")).toBe(0);
    expect(dayStartPercent(range, "2026-09-06")).toBeCloseTo(50);
    expect(dayStartPercent(range, "2026-12-01")).toBe(100);
    expect(dayStartPercent(range, "2026-01-01")).toBe(0);
  });

  it("centres a single day inside its own slot", () => {
    expect(dayCenterPercent(range, "2026-09-01")).toBeCloseTo(5);
    expect(dayCenterPercent(range, "2026-09-10")).toBeCloseTo(95);
  });

  it("measures bars by the number of days they cover", () => {
    expect(getBarPlacement(range, "2026-09-01", "2026-09-01")).toEqual({ left: 0, width: 10, visible: true });
    expect(getBarPlacement(range, "2026-09-06", "2026-09-10")).toEqual({ left: 50, width: 50, visible: true });
  });

  it("clips a bar that starts before or ends after the range", () => {
    const clipped = getBarPlacement(range, "2026-08-20", "2026-09-05");
    expect(clipped.left).toBe(0);
    expect(clipped.width).toBeCloseTo(50);
    expect(clipped.left + clipped.width).toBeLessThanOrEqual(100);
    expect(getBarPlacement(range, "2026-10-01", "2026-10-05").visible).toBe(false);
  });
});

describe("ranges and overlaps", () => {
  it("builds this week from today", () => {
    expect(getWeekRange("2026-08-23")).toEqual({ start: "2026-08-23", end: "2026-08-29", totalDays: 7 });
  });

  it("knows which dates and spans belong to a range", () => {
    const range = makeRange("2026-09-01", "2026-09-10");
    expect(isWithinRange(range, "2026-09-10")).toBe(true);
    expect(isWithinRange(range, "2026-09-11")).toBe(false);
    expect(overlapsRange(range, "2026-08-25", "2026-09-02")).toBe(true);
    expect(overlapsRange(range, "2026-09-11", "2026-09-20")).toBe(false);
  });
});

describe("ticks", () => {
  it("uses weekly marks on a short project", () => {
    const ticks = buildOverviewTicks(makeRange("2026-09-01", "2026-09-29"));
    expect(ticks.map((tick) => tick.label)).toEqual(["9/1", "9/8", "9/15", "9/22", "9/29"]);
    expect(ticks.every((tick) => tick.percent >= 0 && tick.percent <= 100)).toBe(true);
  });

  it("widens the gap so a longer project still fits four to seven marks", () => {
    expect(buildOverviewTicks(makeRange("2026-08-17", "2026-09-23")).map((tick) => tick.label)).toEqual([
      "8/17",
      "8/24",
      "8/31",
      "9/7",
      "9/14",
      "9/21",
    ]);
    const halfYear = buildOverviewTicks(makeRange("2026-04-01", "2026-09-30"));
    expect(halfYear.map((tick) => tick.label)).toEqual(["4/1", "4/29", "5/27", "6/24", "7/22", "8/19", "9/16"]);
    expect(buildOverviewTicks(makeRange("2026-09-01", "2027-03-31")).length).toBeLessThanOrEqual(8);
  });

  it("uses month marks once a project runs past 200 days", () => {
    const ticks = buildOverviewTicks(makeRange("2026-01-05", "2026-12-20"));
    expect(ticks[0].label).toBe("1/5");
    expect(ticks.slice(1).map((tick) => tick.label)).toEqual(["2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]);
  });

  it("drops a month mark that would sit on top of the first date", () => {
    const ticks = buildOverviewTicks(makeRange("2026-01-30", "2026-12-15"));
    expect(ticks.map((tick) => tick.label)).not.toContain("2月");
    expect(ticks[1].label).toBe("3月");
  });

  it("labels every day of the week view with its weekday", () => {
    const ticks = buildWeekTicks(getWeekRange("2026-08-23"));
    expect(ticks).toHaveLength(7);
    expect(ticks[0].sublabel).toBe("日");
    expect(ticks[1].label).toBe("24");
    expect(ticks[6].sublabel).toBe("土");
  });

  it("centres the label on its day while the grid line stays on the day boundary", () => {
    const ticks = buildWeekTicks(getWeekRange("2026-08-23"));
    expect(ticks[0].percent).toBeCloseTo(100 / 14);
    expect(ticks[0].gridPercent).toBe(0);
    expect(ticks[1].gridPercent).toBeCloseTo(100 / 7);
    const overview = buildOverviewTicks(makeRange("2026-09-01", "2026-09-29"));
    expect(overview.map((tick) => tick.gridPercent)).toEqual(overview.map((tick) => tick.percent));
  });
});

describe("labels", () => {
  it("prints the range and the day count", () => {
    expect(formatRangeLabel(makeRange("2026-09-01", "2026-09-29"))).toBe("9/1 — 9/29");
    expect(countDays("2026-09-01", "2026-09-05")).toBe(5);
    expect(countDays("2026-09-01", "2026-09-01")).toBe(1);
  });
});
