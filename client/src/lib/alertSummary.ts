export type AlertSummaryItem = { type: string };

const urgentTypes = new Set(["期限超過", "期限接近", "担当者未設定"]);

export function summarizeAlerts(items: AlertSummaryItem[]) {
  const overdue = items.filter((item) => item.type === "期限超過").length;
  const dueSoon = items.filter((item) => item.type === "期限接近").length;
  const unassigned = items.filter((item) => item.type === "担当者未設定").length;
  const hasUrgent = items.some((item) => urgentTypes.has(item.type));
  const parts = [overdue ? `期限超過 ${overdue}件` : "", unassigned ? `未担当 ${unassigned}件` : "", dueSoon ? `期限接近 ${dueSoon}件` : ""].filter(Boolean);

  return {
    hasUrgent,
    label: parts.length ? parts.join("・") : items.length ? `確認事項 ${items.length}件` : "確認事項はありません",
  };
}
