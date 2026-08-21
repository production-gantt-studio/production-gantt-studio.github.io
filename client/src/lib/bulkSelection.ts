export function toggleBulkSelectionMode(isActive: boolean, selectedTaskIds: string[]) {
  return isActive
    ? { isActive: false, selectedTaskIds: [] as string[] }
    : { isActive: true, selectedTaskIds };
}
