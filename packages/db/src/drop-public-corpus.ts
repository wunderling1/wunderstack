/**
 * Pure guards for dropping public corpus tables. Destructive step is a separate
 * operator script, not the same drizzle release as dual-read (ADR §7).
 */

export interface FundCopyCheck {
  key: string;
  provisionApplied: boolean;
  publicDocuments: number;
  schemaDocuments: number;
  publicChunks: number;
  schemaChunks: number;
  publicEvents: number;
  schemaEvents: number;
}

export type DropPublicDecision =
  | { ok: true }
  | { ok: false; reasons: string[] };

/**
 * Public corpus may be dropped only when every active fund has been provisioned and
 * holds at least the public rows for that fund (copy, not a silent shrink).
 */
export function canDropPublicCorpus(
  funds: FundCopyCheck[],
  publicTablesPresent: boolean,
): DropPublicDecision {
  const reasons: string[] = [];
  if (!publicTablesPresent) {
    reasons.push("public corpus tables are already gone");
  }
  if (funds.length === 0) {
    reasons.push("control.funds has no active funds — refusing to drop the only copy");
  }
  for (const fund of funds) {
    if (!fund.provisionApplied) {
      reasons.push(`fund "${fund.key}" has not applied 0001_provision`);
    }
    if (fund.schemaDocuments < fund.publicDocuments) {
      reasons.push(
        `fund "${fund.key}" documents ${String(fund.schemaDocuments)} < public ${String(fund.publicDocuments)}`,
      );
    }
    if (fund.schemaChunks < fund.publicChunks) {
      reasons.push(
        `fund "${fund.key}" chunks ${String(fund.schemaChunks)} < public ${String(fund.publicChunks)}`,
      );
    }
    if (fund.schemaEvents < fund.publicEvents) {
      reasons.push(
        `fund "${fund.key}" interaction_events ${String(fund.schemaEvents)} < public ${String(fund.publicEvents)}`,
      );
    }
  }
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true };
}
