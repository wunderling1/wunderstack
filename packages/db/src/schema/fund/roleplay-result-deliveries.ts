import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { roleplaySessions } from "./roleplay-sessions";

/**
 * Outbox for delivering a session result to the system that launched it: a signed webhook now,
 * LTI grade passback later. One shared mechanism, one adapter per protocol.
 *
 * Unique per session, mirroring Qonvo's `score_sent` flag: a retried or re-run review must never
 * post a second grade. `nextAttemptAt` lets a failed delivery back off without a queue product.
 *
 * The row exists because the review is server-driven (DECISION-roleplay-agent.md, R4). Delivery that
 * depends on the learner keeping a tab open is not delivery.
 */
export const roleplayResultDeliveries = pgTable(
  "roleplay_result_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => roleplaySessions.id, { onDelete: "cascade" }),
    /** Adapter kind plus its config, snapshotted from the session's `resultTarget` at enqueue time. */
    target: jsonb("target").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roleplay_result_deliveries_session_uq").on(table.sessionId),
    index("roleplay_result_deliveries_due_idx").on(table.status, table.nextAttemptAt),
    check(
      "roleplay_result_deliveries_status_known",
      sql`status IN ('pending', 'delivered', 'failed')`,
    ),
    check(
      "roleplay_result_deliveries_delivered_at_matches_status",
      sql`(status = 'delivered') = (delivered_at IS NOT NULL)`,
    ),
    check("roleplay_result_deliveries_attempts_positive", sql`attempts >= 0`),
  ],
);

export type RoleplayResultDelivery = typeof roleplayResultDeliveries.$inferSelect;
export type NewRoleplayResultDelivery = typeof roleplayResultDeliveries.$inferInsert;
