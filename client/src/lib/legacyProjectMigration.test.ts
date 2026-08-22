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

  it("does not treat a copied Sample with a new browser ID as a project to migrate", () => {
    const candidates = filterLegacyProjectCandidates(
      [
        { id: "project-random-video", project: { title: "動画案件サンプル", client: "Sample", tasks: Array.from({ length: 14 }) }, createdAt: "2026-08-02T00:00:00.000Z" },
        { id: "project-random-user", project: { title: "公開検証用", client: "Sample", tasks: [] }, createdAt: "2026-08-03T00:00:00.000Z" },
      ],
      ["sample-video-production", "sample-event-production", "sample-graphic-production"],
      [
        { title: "動画案件サンプル", client: "Sample", taskCount: 14 },
        { title: "イベント案件サンプル", client: "Sample", taskCount: 8 },
        { title: "グラフィック案件サンプル", client: "Sample", taskCount: 8 },
      ],
    );

    expect(candidates).toEqual([
      { id: "project-random-user", project: { title: "公開検証用", client: "Sample", tasks: [] }, createdAt: "2026-08-03T00:00:00.000Z" },
    ]);
  });

  it("rejects malformed browser storage without creating a migration candidate", () => {
    expect(filterLegacyProjectCandidates("not-an-array", [])).toEqual([]);
    expect(filterLegacyProjectCandidates([{ id: "missing-project" }], [])).toEqual([]);
  });
});
