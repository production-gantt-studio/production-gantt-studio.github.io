import { describe, expect, it } from "vitest";
import { filterLegacyProjectCandidates } from "./legacyProjectMigration";

describe("filterLegacyProjectCandidates", () => {
  it("does not treat built-in Sample cards as browser projects to migrate", () => {
    const candidates = filterLegacyProjectCandidates<{ title: string }>(
      [
        { id: "sample-video-production", project: { title: "動画案件サンプル" }, createdAt: "2026-08-01T00:00:00.000Z" },
        { id: "local-001", project: { title: "手元の案件" }, createdAt: "2026-08-02T00:00:00.000Z" },
      ],
      ["sample-video-production", "sample-event-production", "sample-graphic-production"],
    );

    expect(candidates).toEqual([
      { id: "local-001", project: { title: "手元の案件" }, createdAt: "2026-08-02T00:00:00.000Z" },
    ]);
  });

  it("rejects malformed browser storage without creating a migration candidate", () => {
    expect(filterLegacyProjectCandidates("not-an-array", [])).toEqual([]);
    expect(filterLegacyProjectCandidates([{ id: "missing-project" }], [])).toEqual([]);
  });
});
