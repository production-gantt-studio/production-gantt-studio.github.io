export type AlertTab = "all" | "unassigned" | string;

type AlertLike = {
  assignee: string;
  type: string;
};

export function getAlertTabs(assignees: string[]): AlertTab[] {
  const people = Array.from(new Set(assignees.map((name) => name.trim()).filter((name) => name && name !== "未設定" && name !== "担当者を選択してください")));
  return ["all", ...people, "unassigned"];
}

export function filterAlertsByTab<T extends AlertLike>(alerts: T[], tab: AlertTab) {
  if (tab === "all") return alerts;
  if (tab === "unassigned") return alerts.filter((alert) => alert.type === "担当者未設定");
  return alerts.filter((alert) => alert.assignee === tab);
}
