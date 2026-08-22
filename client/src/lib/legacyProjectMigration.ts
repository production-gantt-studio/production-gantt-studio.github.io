export type LegacyProjectCandidate<T> = {
  id: string;
  project: T;
  createdAt: string;
};

export type BuiltInSampleFingerprint = {
  title: string;
  client: string;
  taskCount: number;
};

function matchesBuiltInSample(project: unknown, fingerprints: Iterable<BuiltInSampleFingerprint>): boolean {
  if (!project || typeof project !== "object") return false;
  const record = project as { title?: unknown; client?: unknown; tasks?: unknown };
  const title = typeof record.title === "string" ? record.title : "";
  const client = typeof record.client === "string" ? record.client : "";
  const taskCount = Array.isArray(record.tasks) ? record.tasks.length : 0;
  return Array.from(fingerprints).some((sample) => sample.title === title && sample.client === client && sample.taskCount === taskCount);
}

/**
 * Built-in Sample cards are presentation data, not a user's legacy projects.
 * Only actual browser-stored projects are candidates for an explicit migration
 * after an authenticated administrator chooses to save them.
 */
export function filterLegacyProjectCandidates<T>(
  records: unknown,
  builtInSampleIds: Iterable<string>,
  builtInSampleFingerprints: Iterable<BuiltInSampleFingerprint> = [],
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
      matchesBuiltInSample(candidate.project, builtInSampleFingerprints) ||
      !candidate.project ||
      typeof candidate.createdAt !== "string"
    ) {
      return [];
    }
    return [{ id: candidate.id, project: candidate.project, createdAt: candidate.createdAt }];
  });
}
