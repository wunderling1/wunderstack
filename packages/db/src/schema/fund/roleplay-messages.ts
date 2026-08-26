import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { roleplaySessions } from "./roleplay-sessions.js";

/**
 * The transcript, one row per turn half. `ordinal` is the position in the conversation, so the
 * reviewer can load the whole thing in order without relying on timestamp ties.
 *
 * The reviewer reads every row, not a trailing window: on a long conversation a window drops the
 * opening, which is exactly where most rubric criteria are decided (Qonvo review-agent.ts).
 */
export const roleplayMessages = pgTable(
  "roleplay_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => roleplaySessions.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roleplay_messages_session_ordinal_uq").on(table.sessionId, table.ordinal),
    index("roleplay_messages_session_idx").on(table.sessionId),
    check("roleplay_messages_role_known", sql`role IN ('user', 'assistant')`),
    check("roleplay_messages_ordinal_positive", sql`ordinal >= 0`),
  ],
);

export type RoleplayMessage = typeof roleplayMessages.$inferSelect;
export type NewRoleplayMessage = typeof roleplayMessages.$inferInsert;
