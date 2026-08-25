import { env } from "@wunderstack/shared";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

export type Database = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | undefined;
let cached: Database | undefined;
let writerClient: ReturnType<typeof postgres> | undefined;
let writerCached: Database | undefined;
let provisionerClient: ReturnType<typeof postgres> | undefined;
let provisionerCached: Database | undefined;

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

  client = postgres(env.DATABASE_URL, { max: 10 });
  cached = drizzle(client, { schema });
  return cached;
}

/**
 * A dedicated writer connection for control.agent_instances (Fase 4, second DB role). Uses
 * TENANT_CONFIG_WRITER_DATABASE_URL when set (deploy alias; a DB user granted write on
 * agent_instances only), else falls back to DATABASE_URL — so the console can write theming/keys
 * even when the main connection is read-only in deployment, without granting broad write access.
 * Separate pool from getDb().
 */
export function getWriterDb(): Database {
  if (writerCached) {
    return writerCached;
  }

  const url = env.TENANT_CONFIG_WRITER_DATABASE_URL ?? env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Neither TENANT_CONFIG_WRITER_DATABASE_URL nor DATABASE_URL is set; cannot open a writer connection.",
    );
  }

  writerClient = postgres(url, { max: 5 });
  writerCached = drizzle(writerClient, { schema });
  return writerCached;
}

/**
 * Resolve the provisioner connection URL. Never falls back to DATABASE_URL — missing
 * PROVISIONER_DATABASE_URL fails visibly. Exported for unit tests.
 */
export function resolveProvisionerUrl(
  provisionerUrl: string | undefined,
): string {
  if (!provisionerUrl) {
    throw new Error(
      "PROVISIONER_DATABASE_URL is not set. Configure it (see .env.example) before creating a fund environment. There is no fallback to DATABASE_URL.",
    );
  }
  return provisionerUrl;
}

/**
 * Provisioner connection for createFundEnvironment (CREATE SCHEMA + write on control.*).
 * Never falls back to DATABASE_URL — missing PROVISIONER_DATABASE_URL fails visibly.
 */
export function getProvisionerDb(): Database {
  if (provisionerCached) {
    return provisionerCached;
  }

  const url = resolveProvisionerUrl(env.PROVISIONER_DATABASE_URL);
  provisionerClient = postgres(url, { max: 5 });
  provisionerCached = drizzle(provisionerClient, { schema });
  return provisionerCached;
}

/**
 * Close the pooled connection so a short-lived process (ingest script, eval run) can exit cleanly.
 * The postgres.js pool keeps open sockets that otherwise hold the event loop open forever. No-op when
 * the DB was never used. Long-lived servers never need this — they keep the pool for the process.
 */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = undefined;
    cached = undefined;
  }
  if (writerClient) {
    await writerClient.end({ timeout: 5 });
    writerClient = undefined;
    writerCached = undefined;
  }
  if (provisionerClient) {
    await provisionerClient.end({ timeout: 5 });
    provisionerClient = undefined;
    provisionerCached = undefined;
  }
}
