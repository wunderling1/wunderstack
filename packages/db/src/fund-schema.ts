import { eq, sql } from "drizzle-orm";

import { getDb, type Database } from "./client.js";
import {
  appliedMigrationsSql,
  copyChunksSql,
  copyDocumentsSql,
  copyEventsSql,
  countTableSql,
  FUND_MIGRATION_PROVISION,
  provisionDdl,
  publicCorpusTablesSql,
  recordMigrationSql,
  truncateFundTablesSql,
} from "./fund-ddl.js";
import { assertFundKey } from "./ident.js";
import { funds } from "./schema/control/funds.js";
import { withSearchPath } from "./search-path.js";
import { fundSchemaName } from "./agent-instances.js";

/**
 * Organizational wrapper: SET LOCAL search_path to this fund's schema for `fn`.
 * Not a security boundary (track B). `public` stays on the path for pgvector operators.
 */
export async function withFundSchema<T>(
  fundKey: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return withSearchPath(fundSchemaName(assertFundKey(fundKey)), fn);
}

export async function publicCorpusExists(): Promise<boolean> {
  const rows = (await getDb().execute(sql.raw(publicCorpusTablesSql()))) as Array<{
    relname: string;
  }>;
  const names = new Set(rows.map((row) => row.relname));
  return names.has("documents") && names.has("chunks") && names.has("interaction_events");
}

export interface ActiveFund {
  key: string;
  schemaName: string;
}

/** Active funds from the control plane. No data-plane rows. */
export async function listActiveFunds(): Promise<ActiveFund[]> {
  return getDb()
    .select({ key: funds.key, schemaName: funds.schemaName })
    .from(funds)
    .where(eq(funds.status, "active"))
    .orderBy(funds.key);
}

/** Register a fund in `control.funds` so the migrator and ingest share one registry. */
export async function registerFund(fundKey: string): Promise<ActiveFund> {
  const key = assertFundKey(fundKey);
  const schemaName = fundSchemaName(key);
  await getDb()
    .insert(funds)
    .values({ key, schemaName, status: "active" })
    .onConflictDoNothing({ target: funds.key });
  return { key, schemaName };
}

async function exec(statement: string): Promise<unknown> {
  return getDb().execute(sql.raw(statement));
}

/**
 * CREATE SCHEMA + corpus tables if missing. Does not copy or truncate.
 * Idempotent. Call from ingest so GATE_DB (empty `control.funds` after drizzle) still works.
 */
export async function ensureFundTables(fundKey: string): Promise<ActiveFund> {
  const fund = await registerFund(fundKey);
  const likePublic = await publicCorpusExists();
  for (const statement of provisionDdl(fund.schemaName, fund.key, likePublic)) {
    await exec(statement);
  }
  return fund;
}

function asCount(result: unknown): number {
  const rows = result as Array<{ n: number | string }>;
  const value = Number(rows[0]?.n);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Copy public corpus rows for one fund into its schema (truncate first). No-op when public
 * corpus tables are already gone. Own transaction per fund — never across N schemas.
 */
export async function copyPublicCorpusIntoFund(fundKey: string): Promise<{
  documents: number;
  chunks: number;
  events: number;
}> {
  const key = assertFundKey(fundKey);
  const schemaName = fundSchemaName(key);
  if (!(await publicCorpusExists())) {
    return { documents: 0, chunks: 0, events: 0 };
  }
  await getDb().transaction(async (tx) => {
    await tx.execute(sql.raw(truncateFundTablesSql(schemaName)));
    await tx.execute(sql.raw(copyDocumentsSql(schemaName, key)));
    await tx.execute(sql.raw(copyChunksSql(schemaName, key)));
    await tx.execute(sql.raw(copyEventsSql(schemaName, key)));
  });
  return {
    documents: asCount(await exec(countTableSql(schemaName, "documents"))),
    chunks: asCount(await exec(countTableSql(schemaName, "chunks"))),
    events: asCount(await exec(countTableSql(schemaName, "interaction_events"))),
  };
}

export async function recordFundMigration(schemaName: string, id: string = FUND_MIGRATION_PROVISION): Promise<void> {
  await exec(recordMigrationSql(schemaName, id));
}

export async function listAppliedFundMigrations(schemaName: string): Promise<string[]> {
  try {
    const rows = (await getDb().execute(sql.raw(appliedMigrationsSql(schemaName)))) as Array<{
      id: string;
    }>;
    return rows.map((row) => row.id);
  } catch {
    return [];
  }
}
