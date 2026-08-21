export function insertItemAfter<T extends { id: string }>(items: T[], item: T, afterId: string): T[] {
  const index = items.findIndex((entry) => entry.id === afterId);
  if (index < 0) return [...items, item];
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}
