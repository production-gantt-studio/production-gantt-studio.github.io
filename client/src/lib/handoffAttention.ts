export type HandoffTone = "normal" | "due" | "overdue";

export function getHandoffTone(input: { isUnscheduled: boolean; end: string; today: string }): HandoffTone {
  if (input.isUnscheduled) return "normal";
  if (input.end < input.today) return "overdue";
  const daysUntilDue = Math.round((Date.parse(`${input.end}T00:00:00`) - Date.parse(`${input.today}T00:00:00`)) / 86_400_000);
  return daysUntilDue <= 7 ? "due" : "normal";
}
