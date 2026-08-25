import { text, timestamp } from "drizzle-orm/pg-core";

import { control } from "./schema.js";

/**
 * Registry of funds known to the control plane. `schemaName` is the data-plane schema
 * (`fund_<key>`). Status `active` is what deploy-gates and the migrator iterate.
 * `name` is the display label for the dashboard (nullable for rows created before 0016).
 */
export const funds = control.table("funds", {
  key: text("key").primaryKey(),
  name: text("name"),
  schemaName: text("schema_name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Fund = typeof funds.$inferSelect;
export type NewFund = typeof funds.$inferInsert;
