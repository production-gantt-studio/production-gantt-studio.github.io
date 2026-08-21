export type ReorderableTask = {
  id: string;
  phase: string;
  parentId?: string | null;
};

export type ReorderResult<T extends ReorderableTask> = {
  tasks: T[];
  moved: boolean;
  reason?: "missing" | "different-level" | "different-phase" | "same-task";
};

/**
 * 同じフェーズ・同じ階層でだけ並べ替える。親タスクを動かす場合は、
 * 直属の詳細タスクをひとまとまりとして追従させる。
 */
export function reorderTaskGroup<T extends ReorderableTask>(
  tasks: T[],
  draggedId: string,
  targetId: string,
): ReorderResult<T> {
  if (draggedId === targetId) return { tasks, moved: false, reason: "same-task" };

  const dragged = tasks.find((task) => task.id === draggedId);
  const target = tasks.find((task) => task.id === targetId);
  if (!dragged || !target) return { tasks, moved: false, reason: "missing" };
  if ((dragged.parentId ?? null) !== (target.parentId ?? null)) return { tasks, moved: false, reason: "different-level" };
  if (dragged.phase !== target.phase) return { tasks, moved: false, reason: "different-phase" };

  const groupIds = new Set([dragged.id, ...tasks.filter((task) => task.parentId === dragged.id).map((task) => task.id)]);
  const movingGroup = tasks.filter((task) => groupIds.has(task.id));
  const remaining = tasks.filter((task) => !groupIds.has(task.id));
  const targetIndex = remaining.findIndex((task) => task.id === target.id);
  if (targetIndex < 0) return { tasks, moved: false, reason: "missing" };

  return {
    tasks: [...remaining.slice(0, targetIndex), ...movingGroup, ...remaining.slice(targetIndex)],
    moved: true,
  };
}
