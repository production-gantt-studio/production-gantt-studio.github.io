export type TaskStatusLabel = "未着手" | "進行中" | "クライアント確認中" | "修正中" | "完了";

const statusGroups = [
  { id: "active", label: "進行中", includes: ["進行中", "修正中"] },
  { id: "review", label: "確認待ち", includes: ["クライアント確認中"] },
  { id: "done", label: "完了", includes: ["完了"] },
  { id: "not-started", label: "未着手", includes: ["未着手"] },
] as const;

export function getStatusSummary(statuses: TaskStatusLabel[]) {
  return statusGroups.map((group) => ({
    id: group.id,
    label: group.label,
    count: statuses.filter((status) => (group.includes as readonly string[]).includes(status)).length,
  }));
}

const compactStatusLabels: Record<TaskStatusLabel, string> = {
  未着手: "未",
  進行中: "進行",
  クライアント確認中: "確認",
  修正中: "修正",
  完了: "完了",
};

export function getCompactStatusLabel(status: TaskStatusLabel) {
  return compactStatusLabels[status];
}

export type TaskTone = "idle" | "progress" | "review" | "done" | "danger";

/**
 * ガントの帯・カードの位置帯に塗る色。重要タスクは状態より優先して赤で出す。
 * 状態バッジと違って面で塗るため、色を1つに決めてから使う。
 */
export function getTaskTone(status: string, isImportant?: boolean): TaskTone {
  if (isImportant) return "danger";
  if (status === "完了") return "done";
  if (status === "クライアント確認中") return "review";
  if (status === "進行中" || status === "修正中") return "progress";
  return "idle";
}
