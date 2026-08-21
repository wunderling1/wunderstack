/**
 * Apply fund-schema migrations from `control.funds`. Each schema has its own
 * `schema_migrations` table. There is no transaction across N schemas: a failure
 * on fund 7 leaves 1–6 applied (fail-visible, resumable).
 *
 * Track B: no CREATE ROLE, no HNSW, no PARTITION, no cross-schema SQL.
 *
 *   pnpm --filter @wunderstack/db-scripts migrate-fund-schemas
 *   pnpm --filter @wunderstack/db-scripts migrate-fund-schemas -- --fund oomt
 */

import { parseArgs } from "node:util";

import {
  assertFundKey,
  closeDb,
  copyPublicCorpusIntoFund,
  ensureFundTables,
  FUND_MIGRATION_PROVISION,
  listActiveFunds,
  listAppliedFundMigrations,
  recordFundMigration,
} from "@wunderstack/db";

async function migrateOne(fundKey: string): Promise<{ skipped: boolean; copied?: { documents: number; chunks: number; events: number } }> {
  const fund = await ensureFundTables(fundKey);
  const applied = await listAppliedFundMigrations(fund.schemaName);
  if (applied.includes(FUND_MIGRATION_PROVISION)) {
    return { skipped: true };
  }
  const copied = await copyPublicCorpusIntoFund(fundKey);
  await recordFundMigration(fund.schemaName);
  return { skipped: false, copied };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { fund: { type: "string" } },
    strict: true,
    allowPositionals: true,
  });

  const funds = values.fund
    ? [{ key: assertFundKey(values.fund) }]
    : await listActiveFunds();

  if (funds.length === 0) {
    console.log("No active funds in control.funds. Nothing to migrate.");
    return;
  }

  const failures: Array<{ fund: string; error: string }> = [];
  for (const fund of funds) {
    try {
      const result = await migrateOne(fund.key);
      if (result.skipped) {
        console.log(`skip  ${fund.key} (${FUND_MIGRATION_PROVISION} already applied)`);
      } else {
        const copied = result.copied ?? { documents: 0, chunks: 0, events: 0 };
        console.log(
          `ok    ${fund.key} documents=${String(copied.documents)} chunks=${String(copied.chunks)} events=${String(copied.events)}`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`fail  ${fund.key}: ${message}`);
      failures.push({ fund: fund.key, error: message });
    }
  }

  if (failures.length > 0) {
    console.error(`\n${String(failures.length)} fund schema(s) failed; remaining were still attempted.`);
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
