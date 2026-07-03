import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// drizzle-kit is a separate CLI that does not read .env on its own, but it does
// evaluate this config on every command. Load the repo-root .env here (relative to
// the package cwd) so `db:migrate`/`db:push` pick up DATABASE_URL without an export.
// Variables already present in the environment take precedence.
const rootEnv = "../../.env";
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  // drizzle-kit generate works offline; migrate/push read DATABASE_URL and fail with
  // a clear error if it is missing.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
