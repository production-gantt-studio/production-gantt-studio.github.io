export type HandoffRecord = {
  id: string;
  taskId: string;
  taskName: string;
  previousAssignee: string;
  nextAssignee: string;
  dueDate: string;
  isUnscheduled: boolean;
  changedBy: string;
  createdAt: string;
  acknowledgedAt?: string | null;
};

export function getPendingHandoffs(records: HandoffRecord[]) {
  return records
    .filter((record) => !record.acknowledgedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function acknowledgeHandoff(records: HandoffRecord[], id: string, acknowledgedAt: string) {
  return records.map((record) => (record.id === id ? { ...record, acknowledgedAt } : record));
}

export function appendHandoff(records: HandoffRecord[], record: HandoffRecord, maxRecords = 80) {
  return [record, ...records].slice(0, maxRecords);
}
