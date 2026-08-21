export type PdfScope = "all" | "phase" | "selected";

export type PdfScopeTask = {
  id: string;
  phase: string;
};

export function selectPdfScopeTasks<T extends PdfScopeTask>(
  tasks: T[],
  scope: PdfScope,
  activePhase: string | "all",
  selectedTaskIds: string[],
) {
  if (scope === "selected") return tasks.filter((task) => selectedTaskIds.includes(task.id));
  if (scope === "phase" && activePhase !== "all") return tasks.filter((task) => task.phase === activePhase);
  return tasks;
}
