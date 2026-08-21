export function isAccordionExpanded(collapsedIds: readonly string[] | undefined, id: string) {
  return !(collapsedIds ?? []).includes(id);
}

export function toggleAccordionId(collapsedIds: readonly string[] | undefined, id: string) {
  const current = collapsedIds ?? [];
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}
