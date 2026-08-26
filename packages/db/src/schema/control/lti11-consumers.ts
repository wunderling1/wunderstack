import { sql } from "drizzle-orm";
import { boolean, check, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { control } from "./schema.js";

/**
 * One LMS (LTI 1.1 consumer) per row, keyed to a fund. Control plane: this is configuration an
 * admin writes, like `roleplay_scenarios`. The sessions a launch produces are fund data.
 *
 * `grade_passback_enabled` defaults false — exporting an AI grade is opt-in (R4/R7). The secret is
 * looked up at delivery time, never snapshotted onto a session.
 */
export const lti11Consumers = control.table(
  "lti11_consumers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fundKey: text("fund_key").notNull(),
    name: text("name").notNull(),
    consumerKey: text("consumer_key").notNull(),
    consumerSecret: text("consumer_secret").notNull(),
    status: text("status").notNull().default("active"),
    gradePassbackEnabled: boolean("grade_passback_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lti11_consumers_consumer_key_uq").on(table.consumerKey),
    check("lti11_consumers_valid_status", sql`status IN ('active', 'inactive')`),
  ],
);

export type Lti11Consumer = typeof lti11Consumers.$inferSelect;
export type NewLti11Consumer = typeof lti11Consumers.$inferInsert;
