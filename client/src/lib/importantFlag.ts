export type ImportantItem = {
  id: string;
  isImportant?: boolean;
};

export function toggleImportantFlag<T extends ImportantItem>(items: T[], id: string) {
  return items.map((item) => item.id === id ? { ...item, isImportant: !item.isImportant } : item);
}
