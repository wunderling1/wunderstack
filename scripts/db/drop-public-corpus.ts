/**
 * Destructive operator step: DROP public.documents / chunks / interaction_events.
 *
 * Not a drizzle migration. Dual-read/write must already be running (commit 1) so this
 * DROP can land separately (commit 2 / ADR: no destructive migration in the same
 * release as the code that started depending on fund schemas).
 *
 *   pnpm --filter @wunderstack/db-scripts drop-public-corpus -- --confirm
 */

import { parseArgs } from "node:util";

import {
  canDropPublicCorpus,
  closeDb,
  countTableSql,
  documents,
  dropPublicCorpusSql,
  eq,
  FUND_MIGRATION_PROVISION,
  getDb,
  interactionEvents,
  listActiveFunds,
  listAppliedFundMigrations,
  publicCorpusExists,
  quoteLiteral,
  sql,
  type FundCopyCheck,
} from "@wunderstack/db";

interface CountRow {
  n: number;
}

function asCount(result: unknown): number {
  const rows = result as CountRow[];
  return Number(rows[0]?.n ?? 0);
}

async function publicFundCounts(fundKey: string): Promise<{ documents: number; chunks: number; events: number }> {
  const db = getDb();
  const [docRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documents)
    .where(eq(documents.fund, fundKey));
  const [eventRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(interactionEvents)
    .where(eq(interactionEvents.fund, fundKey));
  const chunkResult = await db.execute(
    sql.raw(
      `SELECT count(*)::int AS n FROM public.chunks c INNER JOIN public.documents d ON d.id = c.document_id WHERE d.fund = ${quoteLiteral(fundKey)}`,
    ),
  );
  return {
    documents: Number(docRow?.n ?? 0),
    chunks: asCount(chunkResult),
    events: Number(eventRow?.n ?? 0),
  };
}

async function schemaCounts(schemaName: string): Promise<{ documents: number; chunks: number; events: number }> {
  const db = getDb();
  return {
    documents: asCount(await db.execute(sql.raw(countTableSql(schemaName, "documents")))),
    chunks: asCount(await db.execute(sql.raw(countTableSql(schemaName, "chunks")))),
    events: asCount(await db.execute(sql.raw(countTableSql(schemaName, "interaction_events")))),
  };
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: { confirm: { type: "boolean", default: false } },
    strict: true,
    allowPositionals: true,
  });
  const confirm = values.confirm === true || positionals.includes("--confirm");

  const publicPresent = await publicCorpusExists();
  const funds = await listActiveFunds();
  const checks: FundCopyCheck[] = [];

  for (const fund of funds) {
    const applied = await listAppliedFundMigrations(fund.schemaName);
    const schema = await schemaCounts(fund.schemaName);
    const publicCounts = publicPresent
      ? await publicFundCounts(fund.key)
      : { documents: 0, chunks: 0, events: 0 };
    checks.push({
      key: fund.key,
      provisionApplied: applied.includes(FUND_MIGRATION_PROVISION),
      publicDocuments: publicCounts.documents,
      schemaDocuments: schema.documents,
      publicChunks: publicCounts.chunks,
      schemaChunks: schema.chunks,
      publicEvents: publicCounts.events,
      schemaEvents: schema.events,
    });
  }

  const decision = canDropPublicCorpus(checks, publicPresent);
  if (!decision.ok) {
    console.error("Refusing to drop public corpus tables:");
    for (const reason of decision.reasons) {
      console.error(`  - ${reason}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Guards passed for ${String(funds.length)} active fund(s).`);
  if (!confirm) {
    console.log("Dry run. Pass --confirm to DROP public.documents, public.chunks, public.interaction_events.");
    return;
  }

  await getDb().execute(sql.raw(dropPublicCorpusSql()));
  console.log("Dropped public.documents, public.chunks, public.interaction_events.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
