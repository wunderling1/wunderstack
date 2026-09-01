import {
  findFundsWithoutSchema,
  gte,
  interactionEvents,
  listActiveFunds,
  sql,
  withFundSchema,
} from "@wunderstack/db";

import { mapPool } from "./map-pool.js";
import { countsFromRow, outcomeCountSelect, type OutcomeCounts } from "./outcomes.js";

/**
 * Parallel fund-schema reads. Matches the dev reader-pool size (3); production has 10.
 * Unbounded `Promise.all` would stall other dashboard queries.
 */
const FUND_SCHEMA_READ_CONCURRENCY = 3;

export interface OutcomeActivityRow {
  /** Schema the row was read from — the fund this activity belongs to. */
  fundKey: string;
  agentId: string;
  byOutcome: OutcomeCounts;
  lastOccurredAt: Date | null;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" && value.length > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function volume(counts: OutcomeCounts): number {
  return counts.answered + counts.refused + counts.clarified + counts.error + counts.unknown;
}

/**
 * Cross-fund outcome activity since an instant — the admin overviews.
 * One query per fund schema, grouped by agent. Never a SQL join across schemas.
 * Throws when an active fund has no schema: that read would fall through to `public`.
 */
export async function listOutcomeActivity(since: Date): Promise<OutcomeActivityRow[]> {
  const funds = await listActiveFunds();
  const missing = await findFundsWithoutSchema(funds);
  if (missing.length > 0) {
    throw new Error(
      `Active funds without a schema: ${missing.join(", ")}. Provisioning did not complete; ` +
        "reading on would silently return public-corpus rows for these funds.",
    );
  }
  const perFund = await mapPool(funds, FUND_SCHEMA_READ_CONCURRENCY, async (fund) => {
    const rows = await withFundSchema(fund.key, (db) =>
      db
        .select({
          agentId: interactionEvents.agentId,
          ...outcomeCountSelect(),
          lastOccurredAt: sql<Date | string | null>`max(${interactionEvents.occurredAt})`,
        })
        .from(interactionEvents)
        .where(gte(interactionEvents.occurredAt, since))
        .groupBy(interactionEvents.agentId),
    );
    return rows.map((row) => ({
      fundKey: fund.key,
      agentId: row.agentId,
      byOutcome: countsFromRow(row),
      lastOccurredAt: asDate(row.lastOccurredAt),
    }));
  });
  const all = perFund.flat();
  all.sort((a, b) => volume(b.byOutcome) - volume(a.byOutcome));
  return all;
}
