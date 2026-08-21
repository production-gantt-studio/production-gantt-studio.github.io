export type TaskDateFormat = "compact" | "weekday" | "full";

export const taskDateFormatOptions: Array<{ value: TaskDateFormat; label: string }> = [
  { value: "compact", label: "月日（8/20）" },
  { value: "weekday", label: "月日＋曜日（8/20(木)）" },
  { value: "full", label: "年・月・日（2026/8/20）" },
];

function toDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function normalizeTaskDateFormat(value: unknown): TaskDateFormat {
  return value === "weekday" || value === "full" ? value : "compact";
}

export function formatTaskDate(value: string, format: TaskDateFormat) {
  const options = format === "full"
    ? { year: "numeric" as const, month: "numeric" as const, day: "numeric" as const }
    : format === "weekday"
      ? { month: "numeric" as const, day: "numeric" as const, weekday: "short" as const }
      : { month: "numeric" as const, day: "numeric" as const };
  return new Intl.DateTimeFormat("ja-JP", options).format(toDate(value));
}

export function formatTaskDateRange(start: string, end: string, format: TaskDateFormat) {
  const startLabel = formatTaskDate(start, format);
  return start === end ? startLabel : `${startLabel} — ${formatTaskDate(end, format)}`;
}
