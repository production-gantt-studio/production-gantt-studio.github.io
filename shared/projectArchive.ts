/**
 * Server-side project archive: pure, DB-independent helpers.
 *
 * An authenticated project is archived by stamping `archivedAt`. It stays
 * restorable for ARCHIVE_RETENTION_MS (30 days) from that moment. There is no
 * scheduled job — expiry is enforced lazily, at the moment a normal list or
 * archive-list read happens (see server/db.ts `purgeExpiredArchivedProjects`),
 * matching the original LocalStorage-only behavior this replaces.
 */
export const ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function computeArchiveExpiresAt(archivedAt: Date): Date {
  return new Date(archivedAt.getTime() + ARCHIVE_RETENTION_MS);
}

export function isArchiveExpired(archivedAt: Date, now: Date = new Date()): boolean {
  return computeArchiveExpiresAt(archivedAt).getTime() <= now.getTime();
}

export function archiveDaysRemaining(archivedAt: Date, now: Date = new Date()): number {
  const msRemaining = computeArchiveExpiresAt(archivedAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(msRemaining / 86_400_000));
}
