import { jsonb, text, timestamp } from "drizzle-orm/pg-core";

import { control } from "./schema";

/**
 * Registry of funds known to the control plane. `schemaName` is a denormalized copy of
 * `fundSchemaName(key)` (`fund_<key>`) — never a second formula; writers must call that
 * helper and readers assert equality (F1-07). Status `active` is what deploy-gates and the
 * migrator iterate. `name` is the display label for the dashboard (nullable for rows created
 * before 0016). `theme` is fund-level white-label tokens (S1); instances keep a legacy theme
 * column unused.
 */
export const funds = control.table("funds", {
  key: text("key").primaryKey(),
  name: text("name"),
  schemaName: text("schema_name").notNull(),
  status: text("status").notNull().default("active"),
  theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Fund = typeof funds.$inferSelect;
export type NewFund = typeof funds.$inferInsert;
