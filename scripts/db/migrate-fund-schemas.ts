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
  FUND_MIGRATION_ROLEPLAY,
  FUND_MIGRATION_TURN_OUTCOME,
  FUND_MIGRATION_OUTCOME_CHECK,
  FUND_MIGRATION_WINDOW_INDEXES,
  getDb,
  listActiveFunds,
  listAppliedFundMigrations,
  recordFundMigration,
  sql,
  turnOutcomeAlterSql,
  outcomeCheckConstraintSql,
  windowIndexesSql,
} from "@wunderstack/db";

interface MigrateResult {
  copied?: { documents: number; chunks: number; events: number };
  applied: string[];
}

async function migrateOne(fundKey: string): Promise<MigrateResult> {
  // ensureFundTables runs the full provision DDL, which is `CREATE ... IF NOT EXISTS` throughout, so
  // it both creates a missing schema and brings an existing one up to the current table set. The
  // ledger below records what that call actually established.
  const fund = await ensureFundTables(fundKey);
  const already = await listAppliedFundMigrations(fund.schemaName);
  const result: MigrateResult = { applied: [] };

  if (!already.includes(FUND_MIGRATION_PROVISION)) {
    result.copied = await copyPublicCorpusIntoFund(fundKey);
    await recordFundMigration(fund.schemaName, FUND_MIGRATION_PROVISION);
    result.applied.push(FUND_MIGRATION_PROVISION);
  }

  if (!already.includes(FUND_MIGRATION_ROLEPLAY)) {
    await recordFundMigration(fund.schemaName, FUND_MIGRATION_ROLEPLAY);
    result.applied.push(FUND_MIGRATION_ROLEPLAY);
  }

  if (!already.includes(FUND_MIGRATION_TURN_OUTCOME)) {
    const db = getDb();
    for (const statement of turnOutcomeAlterSql(fund.schemaName)) {
      await db.execute(sql.raw(statement));
    }
    await recordFundMigration(fund.schemaName, FUND_MIGRATION_TURN_OUTCOME);
    result.applied.push(FUND_MIGRATION_TURN_OUTCOME);
  }

  if (!already.includes(FUND_MIGRATION_OUTCOME_CHECK)) {
    const db = getDb();
    for (const statement of outcomeCheckConstraintSql(fund.schemaName)) {
      await db.execute(sql.raw(statement));
    }
    await recordFundMigration(fund.schemaName, FUND_MIGRATION_OUTCOME_CHECK);
    result.applied.push(FUND_MIGRATION_OUTCOME_CHECK);
  }

  if (!already.includes(FUND_MIGRATION_WINDOW_INDEXES)) {
    // `ensureFundTables` above already runs these (they live in `fundTableIndexesSql`), so this is
    // the ledger entry rather than the work. Kept explicit so a schema that was provisioned before
    // 0005 shows in `schema_migrations` why it now has the indexes.
    const db = getDb();
    for (const statement of windowIndexesSql(fund.schemaName)) {
      await db.execute(sql.raw(statement));
    }
    await recordFundMigration(fund.schemaName, FUND_MIGRATION_WINDOW_INDEXES);
    result.applied.push(FUND_MIGRATION_WINDOW_INDEXES);
  }

  return result;
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
      if (result.applied.length === 0) {
        console.log(`skip  ${fund.key} (already up to date)`);
      } else if (result.copied) {
        const copied = result.copied;
        console.log(
          `ok    ${fund.key} [${result.applied.join(", ")}] documents=${String(copied.documents)} chunks=${String(copied.chunks)} events=${String(copied.events)}`,
        );
      } else {
        console.log(`ok    ${fund.key} [${result.applied.join(", ")}]`);
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
