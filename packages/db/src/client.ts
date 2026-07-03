import { env } from "@wunderstack/shared";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

let cached: Database | undefined;

/**
 * The single access point to the database (the seam that keeps swapping providers cheap).
 * Lazily creates one pooled connection so importing this package does not require a
 * DATABASE_URL until the database is actually used.
 */
export function getDb(): Database {
  if (cached) {
    return cached;
  }

  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Configure it (see .env.example) before using @wunderstack/db.",
    );
  }

  const client = postgres(env.DATABASE_URL, { max: 10 });
  cached = drizzle(client, { schema });
  return cached;
}
