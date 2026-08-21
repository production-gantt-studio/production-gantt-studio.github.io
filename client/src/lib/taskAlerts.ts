export type AlertTask = {
  id: string;
  name: string;
  end: string;
  assignee: string;
  status: string;
  isImportant?: boolean;
  isUnscheduled?: boolean;
};

export type TaskAlertKind = "担当者未設定" | "期限超過" | "期限接近" | "重要タスク";

export type TaskAlert = {
  id: string;
  taskId: string;
  type: TaskAlertKind;
  title: string;
  date: string;
  assignee: string;
  isUnscheduled: boolean;
  priority: number;
};

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);
}

export function buildTaskAlerts(tasks: AlertTask[], today: string) {
  return tasks
    .filter((task) => task.status !== "完了")
    .flatMap<TaskAlert>((task) => {
      const assignee = task.assignee.trim();
      if (!task.isUnscheduled && !assignee) return [{ id: `unassigned-${task.id}`, taskId: task.id, type: "担当者未設定", title: task.name, date: task.end, assignee: "担当者を選択してください", isUnscheduled: false, priority: 0 }];
      if (task.isUnscheduled) return task.isImportant ? [{ id: `important-${task.id}`, taskId: task.id, type: "重要タスク", title: task.name, date: task.end, assignee: assignee || "担当者未設定", isUnscheduled: true, priority: 3 }] : [];
      const days = daysBetween(today, task.end);
      if (days < 0) return [{ id: `overdue-${task.id}`, taskId: task.id, type: "期限超過", title: task.name, date: task.end, assignee: assignee || "担当者未設定", isUnscheduled: false, priority: 1 }];
      if (days <= 7) return [{ id: `due-${task.id}`, taskId: task.id, type: "期限接近", title: task.name, date: task.end, assignee: assignee || "担当者未設定", isUnscheduled: false, priority: 2 }];
      return task.isImportant ? [{ id: `important-${task.id}`, taskId: task.id, type: "重要タスク", title: task.name, date: task.end, assignee: assignee || "担当者未設定", isUnscheduled: false, priority: 3 }] : [];
    })
    .sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date));
}
