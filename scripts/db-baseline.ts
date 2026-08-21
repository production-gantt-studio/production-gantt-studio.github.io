// One-time bootstrap for adopting `drizzle-kit migrate` on this project's
// *existing* production database.
//
// Why this script exists (read before running):
//
// This app's database was never tracked by drizzle-kit's migration history
// before 2026-08-20 — there was no `drizzle.config.ts` and no
// `drizzle/migrations/` folder in the delivered source. The database
// already has all of this project's tables (users, organizations, projects,
// ...). `drizzle/migrations/0000_baseline_existing_schema.sql` is a
// snapshot of that already-existing schema — it exists so future changes
// can be diffed against it with `drizzle-kit generate`, but it must NEVER
// actually be executed against the real database, because every table it
// creates already exists there (running it would fail with "table already
// exists" errors, or worse, could be misread as a request to touch existing
// tables).
//
// `drizzle-kit migrate` (via drizzle-orm's migrator) tracks progress with a
// single bookkeeping table, `__drizzle_migrations`, and only compares the
// *timestamp of the most recently applied migration* against each
// migration file's own timestamp — it does not check migrations
// individually. So the standard, supported way to adopt drizzle-kit on a
// database that already has the "migration 0000" schema is to record
// migration 0000 as already-applied in that bookkeeping table WITHOUT
// running its SQL, so that only genuinely new migrations (0001 onward) get
// executed for real. That is all this script does:
//
//   1. Connect using DATABASE_URL (same variable the app already uses).
//   2. Create `__drizzle_migrations` if it doesn't exist yet (harmless,
//      idempotent — this is the exact statement drizzle-orm's own migrator
//      runs first).
//   3. If that table is still empty, insert ONE row recording the baseline
//      migration (0000) as applied, using the same hash algorithm
//      drizzle-kit itself uses (sha256 of the migration file's contents) —
//      so `drizzle-kit migrate` later recognizes it correctly.
//   4. If the table already has rows, do nothing and exit — this script is
//      meant to run exactly once, ever, and refuses to run again so it can
//      never overwrite real migration history.
//
// No table other than `__drizzle_migrations` is touched. No application
// data (projects, users, etc.) is read, written, or altered. No API key,
// external service, or paid product is involved — only the same MySQL
// connection string (`DATABASE_URL`) the server already requires to save
// projects.
//
// Run this exactly once, before the first `pnpm db:migrate`, against a
// production/staging database that predates this project's migration
// folder. If your database was *created* via `pnpm db:migrate` from an
// empty schema (e.g. a fresh environment), skip this script entirely —
// `pnpm db:migrate` alone is correct there, since migration 0000 legitimately
// needs to run in that case.

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "..", "drizzle", "migrations");
const BASELINE_TAG = "0000_baseline_existing_schema";
const MIGRATIONS_TABLE = "__drizzle_migrations";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "[db-baseline] DATABASE_URL is not set. This script needs the same MySQL connection string the app already uses to run (no new credentials, no API key)."
    );
    process.exit(1);
  }

  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    console.error(`[db-baseline] Could not find ${journalPath}. Run this from the project root.`);
    process.exit(1);
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf-8"));
  const baselineEntry = journal.entries.find((entry: { tag: string }) => entry.tag === BASELINE_TAG);
  if (!baselineEntry) {
    console.error(`[db-baseline] Could not find a "${BASELINE_TAG}" entry in the migration journal.`);
    process.exit(1);
  }

  const baselineSqlPath = path.join(MIGRATIONS_DIR, `${BASELINE_TAG}.sql`);
  const baselineSqlContents = readFileSync(baselineSqlPath, "utf-8");
  const baselineHash = createHash("sha256").update(baselineSqlContents).digest("hex");
  const baselineCreatedAt = baselineEntry.when;

  const connection = await mysql.createConnection(databaseUrl);
  try {
    await connection.query(
      `create table if not exists \`${MIGRATIONS_TABLE}\` (
        id serial primary key,
        hash text not null,
        created_at bigint
      )`
    );

    const [rows] = await connection.query(`select count(*) as count from \`${MIGRATIONS_TABLE}\``);
    const existingCount = Number((rows as Array<{ count: number }>)[0]?.count ?? 0);

    if (existingCount > 0) {
      console.log(
        `[db-baseline] "${MIGRATIONS_TABLE}" already has ${existingCount} row(s) — this database has already been baselined (or has real migration history). Doing nothing.`
      );
      return;
    }

    await connection.query(
      `insert into \`${MIGRATIONS_TABLE}\` (\`hash\`, \`created_at\`) values (?, ?)`,
      [baselineHash, baselineCreatedAt]
    );

    console.log(
      `[db-baseline] Recorded "${BASELINE_TAG}" as already applied (no SQL from that file was executed). You can now run: pnpm db:migrate`
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("[db-baseline] Failed:", error);
  process.exit(1);
});
