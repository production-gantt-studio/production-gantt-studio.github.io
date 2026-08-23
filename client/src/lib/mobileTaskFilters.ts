/**
 * スマホの案件トップに置く絞り込みチップと、上部サマリーの計算。
 * 「遅れ」「今週」の意味をここ1か所に固定し、一覧・ガント・サマリーで食い違わせない。
 */
import { addDays } from "@/lib/mobileTimeline";

export type MobileTaskFilter = "all" | "late" | "week" | "mine" | "unscheduled";

export type FilterableTask = {
  id: string;
  name: string;
  start: string;
  end: string;
  status: string;
  assignee: string;
  isUnscheduled?: boolean;
  dependencies: string[];
};

export const mobileTaskFilters: Array<{ value: MobileTaskFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "late", label: "遅れ" },
  { value: "week", label: "今週" },
  { value: "mine", label: "自分" },
  { value: "unscheduled", label: "日程未定" },
];

export function isLateTask(task: FilterableTask, today: string) {
  return !task.isUnscheduled && task.status !== "完了" && task.end < today;
}

/** 今週＝今日からの7日間に、日程がかかっているタスク。 */
export function isThisWeekTask(task: FilterableTask, today: string) {
  if (task.isUnscheduled) return false;
  return task.start <= addDays(today, 6) && task.end >= today;
}

export function countLateTasks(tasks: FilterableTask[], today: string) {
  return tasks.filter((task) => isLateTask(task, today)).length;
}

/** 日程が決まっているものを日付順に、日程未定は最後に並べる。 */
export function sortMobileTasks<T extends FilterableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const unscheduled = Number(Boolean(a.isUnscheduled)) - Number(Boolean(b.isUnscheduled));
    if (unscheduled !== 0) return unscheduled;
    if (a.isUnscheduled && b.isUnscheduled) return a.name.localeCompare(b.name, "ja");
    return a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.name.localeCompare(b.name, "ja");
  });
}

export function filterMobileTasks<T extends FilterableTask>(
  tasks: T[],
  filter: MobileTaskFilter,
  options: { today: string; assignee: string },
): T[] {
  const filtered = tasks.filter((task) => {
    if (filter === "late") return isLateTask(task, options.today);
    if (filter === "week") return isThisWeekTask(task, options.today);
    if (filter === "mine") return Boolean(options.assignee) && task.assignee === options.assignee;
    if (filter === "unscheduled") return Boolean(task.isUnscheduled);
    return true;
  });
  return sortMobileTasks(filtered);
}

/** 次にやること。遅れているものを最優先し、次に期限が近い未完了タスクを返す。 */
export function getNextTask<T extends FilterableTask>(tasks: T[], today: string): T | null {
  const open = tasks.filter((task) => task.status !== "完了");
  const scheduled = open.filter((task) => !task.isUnscheduled).sort((a, b) => a.end.localeCompare(b.end) || a.start.localeCompare(b.start));
  return scheduled[0] ?? open.find((task) => task.isUnscheduled) ?? null;
}

/** タスク詳細の「前後のタスク」。前＝このタスクが待っている工程、後＝このタスクを待っている工程。 */
export function getAdjacentTasks<T extends FilterableTask>(tasks: T[], taskId: string) {
  const target = tasks.find((task) => task.id === taskId);
  if (!target) return { previous: [] as T[], next: [] as T[] };
  return {
    previous: tasks.filter((task) => target.dependencies.includes(task.id)),
    next: tasks.filter((task) => task.dependencies.includes(target.id)),
  };
}
