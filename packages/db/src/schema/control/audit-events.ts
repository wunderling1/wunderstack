import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { control } from "./schema.js";

/**
 * Thin control-plane audit log for fund lifecycle runbooks. No corpus text.
 * Never GRANT TO PUBLIC — dashboard-login via scripts/db/grant-reader.ts.
 */
export const auditEvents = control.table("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  /** fund_created | fund_dumped | fund_deactivated | fund_deleted | fund_restored | fund_promoted */
  action: text("action").notNull(),
  fundKey: text("fund_key").notNull(),
  actor: text("actor").notNull().default("runbook"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
});

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
