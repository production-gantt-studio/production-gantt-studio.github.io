import { describe, expect, it } from "vitest";
import { previewPayloadToClientShape, projectRowToClientShape } from "./caseMapping";

// A share/invite preview endpoint hands back the raw `projects` row: snake_case
// keys, `data` still a jsonb object. The screens do JSON.parse(project.data) and
// swallow the failure, so an unmapped payload silently leaves the *previous*
// project on screen — a share link showing someone else's project.

const rawSharePayload = {
  project: {
    id: "11111111-2222-3333-4444-555555555555",
    public_id: "project-0f9a0501-5d4",
    title: "受入検証 2026-08-23",
    client: "受入テスト",
    event_month: "2026-10",
    data: { title: "受入検証 2026-08-23", tasks: [{ id: "t1", status: "進行中" }] },
    archived_at: null,
    created_at: "2026-08-22T23:20:00.000Z",
  },
  expiresAt: "2026-08-24T00:00:00.000Z",
};

describe("previewPayloadToClientShape", () => {
  it("re-encodes the jsonb data column as the JSON string the screens parse", () => {
    const mapped = previewPayloadToClientShape(rawSharePayload)!;
    expect(typeof mapped.project!.data).toBe("string");
    expect(JSON.parse(mapped.project!.data as string)).toEqual(rawSharePayload.project.data);
  });

  it("converts the row to the camelCase names the screens read", () => {
    const mapped = previewPayloadToClientShape(rawSharePayload)!;
    const project = mapped.project as Record<string, unknown>;
    expect(project.publicId).toBe("project-0f9a0501-5d4");
    expect(project.eventMonth).toBe("2026-10");
    expect(project.title).toBe("受入検証 2026-08-23");
  });

  it("keeps the rest of the envelope untouched", () => {
    const mapped = previewPayloadToClientShape(rawSharePayload)!;
    expect(mapped.expiresAt).toBe("2026-08-24T00:00:00.000Z");
  });

  it("passes a null project through (invite-preview sends null for editors)", () => {
    const mapped = previewPayloadToClientShape({ role: "editor", project: null, expiresAt: "x" })!;
    expect(mapped.project).toBeNull();
    expect(mapped.role).toBe("editor");
  });

  it("returns null for a null payload", () => {
    expect(previewPayloadToClientShape(null)).toBeNull();
  });

  it("matches projectRowToClientShape for the project field", () => {
    const mapped = previewPayloadToClientShape(rawSharePayload)!;
    expect(mapped.project).toEqual(projectRowToClientShape(rawSharePayload.project));
  });
});
