import { env } from "@wunderstack/shared";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

export type Database = PostgresJsDatabase<typeof schema>;

type Sql = ReturnType<typeof postgres>;

type PoolSlot = { client: Sql; db: Database };

type PoolKind = "reader" | "writer" | "provisioner";

type GlobalPools = {
  reader?: PoolSlot;
  writer?: PoolSlot;
  provisioner?: PoolSlot;
};

/**
 * Process-wide pool slots. Next.js webpack (transpilePackages + HMR) can evaluate this
 * module more than once; a `let` cache would orphan the previous postgres.js pool. The
 * sockets stay open (`idle_timeout` default 0) until the process dies.
 */
const GLOBAL_KEY = "__wunderstack_db_pools" as const;

function globalHolder(): typeof globalThis & { [GLOBAL_KEY]?: GlobalPools } {
  return globalThis as typeof globalThis & { [GLOBAL_KEY]?: GlobalPools };
}

function globalPools(): GlobalPools {
  const holder = globalHolder();
  holder[GLOBAL_KEY] ??= {};
  return holder[GLOBAL_KEY];
}

/** Starter-512 has few non-superuser slots. Dev must not open 10+5+5 per Next process. */
function poolMax(kind: PoolKind): number {
  if (env.NODE_ENV === "production") {
    return kind === "reader" ? 10 : 5;
  }
  return kind === "reader" ? 3 : 2;
}

function applicationName(kind: PoolKind): string {
  const app = env.DB_APPLICATION_NAME ?? "wunderstack";
  return `${app}:${kind}`.slice(0, 63);
}

function openPool(url: string, kind: PoolKind): PoolSlot {
  const client = postgres(url, {
    max: poolMax(kind),
    idle_timeout: env.NODE_ENV === "production" ? 60 : 20,
    max_lifetime: 60 * 30,
    // TCP handshake only. postgres.js has no pool-acquire timeout; queued
    // checkouts wait until a slot frees. Forgotten transactions: GUC below.
    connect_timeout: 30,
    connection: {
      application_name: applicationName(kind),
      idle_in_transaction_session_timeout: 15_000,
    },
  });
  return { client, db: drizzle(client, { schema }) };
}

/**
 * The single access point to the database (the seam that keeps swapping providers cheap).
 * Lazily creates one pooled connection so importing this package does not require a
 * DATABASE_URL until the database is actually used.
 */
export function getDb(): Database {
  const pools = globalPools();
  if (pools.reader) {
    return pools.reader.db;
  }

  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Configure it (see .env.example) before using @wunderstack/db.",
    );
  }

  pools.reader = openPool(env.DATABASE_URL, "reader");
  return pools.reader.db;
}

/**
 * A dedicated writer connection for control.agent_instances (Fase 4, second DB role). Uses
 * TENANT_CONFIG_WRITER_DATABASE_URL when set (deploy alias; a DB user granted write on
 * control.agent_instances, control.roleplay_scenarios and control.lti11_consumers), else falls back
 * to DATABASE_URL — so the console can write theming/keys/scenarios even when the main connection
 * is read-only in deployment, without granting broad write access. Separate pool from getDb().
 */
export function getWriterDb(): Database {
  const pools = globalPools();
  if (pools.writer) {
    return pools.writer.db;
  }

  const url = env.TENANT_CONFIG_WRITER_DATABASE_URL ?? env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Neither TENANT_CONFIG_WRITER_DATABASE_URL nor DATABASE_URL is set; cannot open a writer connection.",
    );
  }

  pools.writer = openPool(url, "writer");
  return pools.writer.db;
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
  const pools = globalPools();
  if (pools.provisioner) {
    return pools.provisioner.db;
  }

  const url = resolveProvisionerUrl(env.PROVISIONER_DATABASE_URL);
  pools.provisioner = openPool(url, "provisioner");
  return pools.provisioner.db;
}

/**
 * Close the pooled connection so a short-lived process (ingest script, eval run) can exit cleanly.
 * The postgres.js pool keeps open sockets that otherwise hold the event loop open forever. No-op when
 * the DB was never used. Long-lived servers never need this — they keep the pool for the process.
 */
export async function closeDb(): Promise<void> {
  const holder = globalHolder();
  const pools = holder[GLOBAL_KEY];
  delete holder[GLOBAL_KEY];
  if (!pools) {
    return;
  }
  const ending = [pools.reader, pools.writer, pools.provisioner]
    .filter((slot): slot is PoolSlot => slot !== undefined)
    .map((slot) => slot.client.end({ timeout: 5 }));
  await Promise.all(ending);
}
