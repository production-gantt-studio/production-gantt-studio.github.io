export type TemplateTask = {
  id: string;
  dependencies?: string[];
  parentId?: string | null;
  status?: string;
  isUnscheduled?: boolean;
};

/** テンプレートのタスクを、新規案件で安全に編集できる独立した未着手タスクへ複製する。 */
export function cloneTemplateTasks<T extends TemplateTask>(tasks: T[], createId: () => string): T[] {
  const idMap = new Map(tasks.map((task) => [task.id, createId()]));
  return tasks.map((task) => ({
    ...task,
    id: idMap.get(task.id) ?? createId(),
    dependencies: (task.dependencies ?? []).map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)),
    parentId: task.parentId ? idMap.get(task.parentId) ?? null : null,
    status: "未着手",
    isUnscheduled: true,
  }));
}
