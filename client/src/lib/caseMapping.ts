// Phase 2: Postgres/PostgREST rows come back snake_case (public_id,
// event_month, created_at, ...). The existing screens (Home.tsx,
// ProjectIndex.tsx, Invite.tsx) were written against the original
// Drizzle/MySQL layer's camelCase field names (publicId, eventMonth,
// createdAt, ...) and are explicitly NOT being rewritten in Phase 2 — so the
// shim converts every row at the boundary, once, here, rather than scattering
// per-field renames across each Edge Function/query.

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

// PostgREST always serializes timestamptz columns as ISO-8601 strings, but
// the existing screens were written against the original Drizzle/mysql2
// layer, which handed back real JS Date objects for every timestamp column
// (and superjson preserved that across the tRPC wire) — e.g.
// ProjectIndex.tsx calls `project.createdAt.toISOString()` and
// `project.archivedAt.toISOString()` directly, with no `new Date(...)`
// wrapper, so a plain string there would throw. This converts any
// ISO-8601 timestamp-shaped string back into a Date at the same boundary
// where snake_case becomes camelCase, so every mapped row matches the
// original Date-object contract exactly. No non-timestamp column in this
// schema happens to look like an ISO datetime string, so this is safe to
// apply unconditionally rather than needing a per-column allow-list.
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function reviveDates(value: unknown): unknown {
  return typeof value === "string" && ISO_TIMESTAMP_RE.test(value) ? new Date(value) : value;
}

export function rowToCamelCase<T = Record<string, unknown>>(row: Record<string, unknown> | null | undefined): T | null {
  if (row == null) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[snakeToCamel(key)] = reviveDates(value);
  }
  return out as T;
}

export function rowsToCamelCase<T = Record<string, unknown>>(rows: Record<string, unknown>[] | null | undefined): T[] {
  if (!rows) return [];
  return rows.map((row) => rowToCamelCase<T>(row) as T);
}

/**
 * A `projects` row's `data` column is jsonb in Postgres (an object), but
 * every existing screen still expects `project.data` to be a JSON *string*
 * (JSON.parse(remote.data)), matching the original MySQL `longtext` column's
 * client contract exactly. This performs both the case conversion AND that
 * string re-encoding in one step.
 */
export function projectRowToClientShape(row: Record<string, unknown> | null | undefined) {
  if (row == null) return null;
  const camel = rowToCamelCase<Record<string, unknown>>(row)!;
  return { ...camel, data: JSON.stringify(row.data ?? {}) };
}
