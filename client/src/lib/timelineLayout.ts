export type TimelineDisplay = "days" | "weeks" | "months";

export const DAY_UNIT_WIDTH = 34;
export const WEEK_UNIT_WIDTH = 126;
export const MONTH_DAY_UNIT_WIDTH = 8;
export const TASK_COLUMN_MIN_WIDTH = 260;
export const TASK_COLUMN_MAX_WIDTH = 520;
export const TASK_COLUMN_DEFAULT_WIDTH = 360;

export function getTimelineDisplayMetrics(display: TimelineDisplay, dayCount: number) {
  const daysPerUnit = display === "weeks" ? 7 : 1;
  return {
    daysPerUnit,
    unitWidth: display === "weeks" ? WEEK_UNIT_WIDTH : display === "months" ? MONTH_DAY_UNIT_WIDTH : DAY_UNIT_WIDTH,
    unitCount: Math.max(1, Math.ceil(dayCount / daysPerUnit)),
  };
}

export function clampTaskColumnWidth(width: number) {
  return Math.max(TASK_COLUMN_MIN_WIDTH, Math.min(TASK_COLUMN_MAX_WIDTH, Math.round(width)));
}
