export type AssignedOpenTask = {
  id: string;
  assignee: string;
  status: string;
  end: string;
  isUnscheduled?: boolean;
};

export type AssignedTaskScope = "all" | "today" | "week" | "unscheduled";

function plusDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

export function getAssignedOpenTasks<T extends AssignedOpenTask>(tasks: T[], assignee: string, today: string, scope: AssignedTaskScope) {
  if (!assignee) return [];
  const weekEnd = plusDays(today, 6);
  return tasks
    .filter((task) => task.assignee === assignee && task.status !== "完了")
    .filter((task) => {
      if (scope === "all") return true;
      if (scope === "unscheduled") return Boolean(task.isUnscheduled);
      if (task.isUnscheduled) return false;
      if (scope === "today") return task.end === today;
      return task.end >= today && task.end <= weekEnd;
    })
    .sort((a, b) => Number(Boolean(a.isUnscheduled)) - Number(Boolean(b.isUnscheduled)) || a.end.localeCompare(b.end));
}
