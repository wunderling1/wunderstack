import { auditEvents, type NewAuditEvent } from "./schema/control/audit-events.js";
import { getWriterDb, type Database } from "./client.js";

export const AUDIT_ACTIONS = [
  "fund_created",
  "fund_dumped",
  "fund_deactivated",
  "fund_deleted",
  "fund_restored",
  "fund_promoted",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Append a thin control-plane audit row. Defaults to the writer connection (not the read-only
 * getDb()), and accepts an optional db/tx so createFundEnvironment can keep the insert in the
 * same transaction.
 */
export async function recordAuditEvent(
  input: {
    action: AuditAction;
    fundKey: string;
    actor?: string;
    details?: Record<string, unknown>;
  },
  db: Database = getWriterDb(),
): Promise<void> {
  const row: NewAuditEvent = {
    action: input.action,
    fundKey: input.fundKey,
    actor: input.actor ?? "runbook",
    details: input.details ?? {},
  };
  await db.insert(auditEvents).values(row);
}
