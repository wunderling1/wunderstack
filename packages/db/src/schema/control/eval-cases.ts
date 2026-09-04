import { text, uuid } from "drizzle-orm/pg-core";

import { control } from "./schema";

/**
 * Labelled evaluation cases (question → expected passage). Currently empty (PR0). Parked in
 * control because there is no fund source text yet; if rows with CAO/catalog text land here,
 * move the table to the fund schema (ADR-multitenant-database).
 */
export const evalCases = control.table("eval_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  expectedPassage: text("expected_passage").notNull(),
  tags: text("tags").array().notNull().default([]),
});

export type EvalCase = typeof evalCases.$inferSelect;
export type NewEvalCase = typeof evalCases.$inferInsert;
