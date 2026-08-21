import { describe, expect, it } from "vitest";
import { ARCHIVE_RETENTION_MS, archiveDaysRemaining, computeArchiveExpiresAt, isArchiveExpired } from "./projectArchive";

describe("projectArchive", () => {
  it("retains an archived project for exactly 30 days", () => {
    expect(ARCHIVE_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("computes the expiry timestamp 30 days after archiving", () => {
    const archivedAt = new Date("2026-08-01T00:00:00.000Z");
    expect(computeArchiveExpiresAt(archivedAt).toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("is not expired before the 30-day mark and is expired at/after it", () => {
    const archivedAt = new Date("2026-08-01T00:00:00.000Z");
    expect(isArchiveExpired(archivedAt, new Date("2026-08-30T23:59:59.999Z"))).toBe(false);
    expect(isArchiveExpired(archivedAt, new Date("2026-08-31T00:00:00.000Z"))).toBe(true);
    expect(isArchiveExpired(archivedAt, new Date("2026-09-15T00:00:00.000Z"))).toBe(true);
  });

  it("counts down whole days remaining, floored at 0", () => {
    const archivedAt = new Date("2026-08-01T00:00:00.000Z");
    expect(archiveDaysRemaining(archivedAt, new Date("2026-08-01T00:00:00.000Z"))).toBe(30);
    expect(archiveDaysRemaining(archivedAt, new Date("2026-08-30T00:00:00.000Z"))).toBe(1);
    expect(archiveDaysRemaining(archivedAt, new Date("2026-09-15T00:00:00.000Z"))).toBe(0);
  });
});
