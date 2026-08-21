/**
 * Provision one physical fund schema and copy (do not move) that fund's corpus
 * out of public.
 *
 * Track B (ADR-multitenant-database, NOTE-db-rollen-en-pooling):
 *   - CREATE SCHEMA fund_<key> as an owner object.
 *   - NO CREATE ROLE. Isolation is D15 (one runtime process = one fund), not a
 *     Postgres role. search_path is organizational; a forgotten SET is not
 *     permission denied.
 *   - Table shape matches public (LIKE). No PARTITION BY, no HNSW/ivfflat.
 *   - CHECK (documents.fund = '<fund-key>') is a tripwire on the domain key.
 *   - public.documents / chunks / interaction_events stay in place (PR5 drops them).
 *   - eval_cases stays in control (empty; not fund content).
 *
 *   pnpm --filter @wunderstack/db-scripts provision -- --fund elektronische-detailhandel
 */

import { parseArgs } from "node:util";

import {
  assertFundKey,
  closeDb,
  documents,
  eq,
  fundSchemaName,
  funds,
  getDb,
  interactionEvents,
  quoteIdent,
  quoteLiteral,
  sql,
} from "@wunderstack/db";

import {
  addChunksFkSql,
  addFundCheckSql,
  assertNoAnnOrPartitionSql,
  copyChunksSql,
  copyDocumentsSql,
  copyEventsSql,
  countTableSql,
  createChunksLikeSql,
  createDocumentsLikeSql,
  createEventsLikeSql,
  createSchemaSql,
  publicCorpusTablesSql,
  truncateFundTablesSql,
} from "./provision-sql.js";

const DEFAULT_FUND = "elektronische-detailhandel";

interface CountRow {
  n: number;
}

interface ShapeRow {
  table_name: string;
  relkind: string;
  indexdefs: string;
}

interface PublicTableRow {
  nspname: string;
  relname: string;
}

async function exec(statement: string): Promise<unknown> {
  return getDb().execute(sql.raw(statement));
}

function asCount(result: unknown): number {
  const rows = result as CountRow[];
  const n = rows[0]?.n;
  const value = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(value)) {
    throw new Error(`Expected count row, got ${JSON.stringify(result)}`);
  }
  return value;
}

async function publicCounts(fundKey: string): Promise<{
  documents: number;
  chunks: number;
  events: number;
}> {
  const db = getDb();
  const [docRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documents)
    .where(eq(documents.fund, fundKey));
  const [eventRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(interactionEvents)
    .where(eq(interactionEvents.fund, fundKey));
  const chunkResult = await exec(
    `SELECT count(*)::int AS n FROM public.chunks c INNER JOIN public.documents d ON d.id = c.document_id WHERE d.fund = ${quoteLiteral(fundKey)}`,
  );
  return {
    documents: Number(docRow?.n ?? 0),
    chunks: asCount(chunkResult),
    events: Number(eventRow?.n ?? 0),
  };
}

function assertFlatExactSearch(rows: ShapeRow[]): void {
  if (rows.length !== 3) {
    throw new Error(
      `Expected 3 fund tables, found ${String(rows.length)}: ${rows.map((row) => row.table_name).join(", ")}`,
    );
  }
  for (const row of rows) {
    if (row.relkind === "p") {
      throw new Error(`Refusing partitioned table ${row.table_name} (PR3 copies shape, no PARTITION BY)`);
    }
    if (/\bhnsw\b/i.test(row.indexdefs) || /\bivfflat\b/i.test(row.indexdefs)) {
      throw new Error(
        `Refusing ANN index on ${row.table_name}: ${row.indexdefs} (4096-dim exact search; no HNSW/ivfflat)`,
      );
    }
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { fund: { type: "string", default: DEFAULT_FUND } },
    strict: true,
    allowPositionals: true,
  });
  const fundKey = assertFundKey(values.fund ?? DEFAULT_FUND);
  const schemaName = fundSchemaName(fundKey);

  const db = getDb();
  const [fund] = await db.select().from(funds).where(eq(funds.key, fundKey)).limit(1);
  if (!fund) {
    throw new Error(`Fund ${fundKey} is not in control.funds. Register it before provisioning a schema.`);
  }
  if (fund.schemaName !== schemaName) {
    throw new Error(
      `control.funds.schema_name is ${JSON.stringify(fund.schemaName)}, expected ${JSON.stringify(schemaName)}.`,
    );
  }

  console.log(`Track B: CREATE SCHEMA ${schemaName} (no CREATE ROLE; isolation is D15, not a role).`);
  await exec(createSchemaSql(schemaName));
  await exec(createDocumentsLikeSql(schemaName));
  await exec(createChunksLikeSql(schemaName));
  await exec(createEventsLikeSql(schemaName));
  for (const statement of addFundCheckSql(schemaName, fundKey)) {
    await exec(statement);
  }
  for (const statement of addChunksFkSql(schemaName)) {
    await exec(statement);
  }

  const shape = (await exec(assertNoAnnOrPartitionSql(schemaName))) as ShapeRow[];
  assertFlatExactSearch(shape);

  const beforePublic = await publicCounts(fundKey);
  if (beforePublic.documents === 0) {
    throw new Error(`No public.documents rows for fund ${fundKey}; nothing to copy.`);
  }

  await exec(truncateFundTablesSql(schemaName));
  await exec(copyDocumentsSql(schemaName, fundKey));
  await exec(copyChunksSql(schemaName, fundKey));
  await exec(copyEventsSql(schemaName, fundKey));

  const copyDocuments = asCount(await exec(countTableSql(schemaName, "documents")));
  const copyChunks = asCount(await exec(countTableSql(schemaName, "chunks")));
  const copyEvents = asCount(await exec(countTableSql(schemaName, "interaction_events")));
  const afterPublic = await publicCounts(fundKey);

  if (copyDocuments !== beforePublic.documents || copyChunks !== beforePublic.chunks || copyEvents !== beforePublic.events) {
    throw new Error(
      `Copy count mismatch for ${fundKey}: public ${JSON.stringify(beforePublic)} vs ${schemaName} ` +
        JSON.stringify({ documents: copyDocuments, chunks: copyChunks, events: copyEvents }),
    );
  }
  if (
    afterPublic.documents !== beforePublic.documents ||
    afterPublic.chunks !== beforePublic.chunks ||
    afterPublic.events !== beforePublic.events
  ) {
    throw new Error(`public corpus changed during copy (move vs copy). before=${JSON.stringify(beforePublic)} after=${JSON.stringify(afterPublic)}`);
  }

  const publicTables = (await exec(publicCorpusTablesSql())) as PublicTableRow[];
  const publicNames = publicTables.map((row) => row.relname).sort();
  if (publicNames.join(",") !== "chunks,documents,interaction_events") {
    throw new Error(`public corpus tables missing after copy: ${publicNames.join(", ")}`);
  }

  console.log(`Copied fund=${fundKey} schema=${schemaName}`);
  console.log(`  documents:           ${String(copyDocuments)} (public intact)`);
  console.log(`  chunks:              ${String(copyChunks)} (public intact)`);
  console.log(`  interaction_events:  ${String(copyEvents)} (public intact)`);
  console.log(`  eval_cases:          skipped (control; empty / not fund content)`);
  console.log(`Quoted schema ident:   ${quoteIdent(schemaName)}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
