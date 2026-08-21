export type GanttBarDisplayMode = "task" | "status" | "compact-status";

export function getGanttBarDisplayMode(width: number): GanttBarDisplayMode {
  if (width <= 78) return "compact-status";
  if (width <= 126) return "status";
  return "task";
}
