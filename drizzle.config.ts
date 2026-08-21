import { defineConfig } from "drizzle-kit";

// Standard drizzle-kit configuration for this project's existing MySQL
// database. This only wires up already-used tooling (drizzle-orm +
// drizzle-kit, both already dependencies) to this project's schema and
// migrations folder — it does not add any new service, API, or paid
// dependency.
//
// `dbCredentials.url` is read from the same `DATABASE_URL` environment
// variable the running server already uses (see `server/db.ts`). Nothing
// here requires typing a connection string or API key into a file — set
// `DATABASE_URL` in the deployment environment as usual, and the commands
// below pick it up automatically:
//
//   pnpm db:generate   — (re)compute migration SQL from drizzle/schema.ts
//   pnpm db:baseline   — one-time only: mark the pre-existing schema as
//                        already applied, without running any SQL against it
//                        (see scripts/db-baseline.ts for why this is needed)
//   pnpm db:migrate    — apply any not-yet-applied migration files in
//                        drizzle/migrations/ to DATABASE_URL
export default defineConfig({
  dialect: "mysql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
