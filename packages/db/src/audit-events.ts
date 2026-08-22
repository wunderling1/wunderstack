import { auditEvents, type NewAuditEvent } from "./schema/control/audit-events.js";
import { getDb } from "./client.js";

export const AUDIT_ACTIONS = ["fund_deleted", "fund_restored", "fund_promoted"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export async function recordAuditEvent(input: {
  action: AuditAction;
  fundKey: string;
  actor?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const row: NewAuditEvent = {
    action: input.action,
    fundKey: input.fundKey,
    actor: input.actor ?? "runbook",
    details: input.details ?? {},
  };
  await getDb().insert(auditEvents).values(row);
}
