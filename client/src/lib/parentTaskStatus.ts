export type ParentStatusTask = {
  id: string;
  parentId?: string | null;
  status: string;
};

const activeChildStatuses = new Set(["進行中", "修正中"]);
const completedChildStatus = "完了";

/**
 * 詳細タスクが着手された時だけ、親タスクを進行中へそろえる。
 * 完了・確認待ちへの変更は親の状態を勝手に上書きしない。
 */
export function syncParentTaskStatus<T extends ParentStatusTask>(tasks: T[], childTaskId: string): T[] {
  const child = tasks.find((task) => task.id === childTaskId);
  if (!child?.parentId) return tasks;
  const children = tasks.filter((task) => task.parentId === child.parentId);
  if (!children.length) return tasks;

  const nextParentStatus = children.every((task) => task.status === completedChildStatus)
    ? completedChildStatus
    : children.some((task) => activeChildStatuses.has(task.status))
      ? "進行中"
      : null;

  if (!nextParentStatus) return tasks;
  return tasks.map((task) => task.id === child.parentId ? { ...task, status: nextParentStatus } : task);
}
