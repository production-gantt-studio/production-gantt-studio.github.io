export type LegacyProjectCandidate<T> = {
  id: string;
  project: T;
  createdAt: string;
};

/**
 * Built-in Sample cards are presentation data, not a user's legacy projects.
 * Only actual browser-stored projects are candidates for an explicit migration
 * after an authenticated administrator chooses to save them.
 */
export function filterLegacyProjectCandidates<T>(
  records: unknown,
  builtInSampleIds: Iterable<string>,
): LegacyProjectCandidate<T>[] {
  if (!Array.isArray(records)) return [];
  const sampleIds = new Set(builtInSampleIds);
  return records.flatMap((record) => {
    if (!record || typeof record !== "object") return [];
    const candidate = record as Partial<LegacyProjectCandidate<T>>;
    if (
      typeof candidate.id !== "string" ||
      !candidate.id ||
      sampleIds.has(candidate.id) ||
      !candidate.project ||
      typeof candidate.createdAt !== "string"
    ) {
      return [];
    }
    return [{ id: candidate.id, project: candidate.project, createdAt: candidate.createdAt }];
  });
}
