/**
 * 登録月より前の準備タスクは許容し、開催月の末日を超える日程だけを
 * 案件スケジュール上の見直し対象として扱う。
 */
export function exceedsEventMonth(taskEnd: string, eventMonthEnd: string): boolean {
  return taskEnd > eventMonthEnd;
}
