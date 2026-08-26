import type { RoleplayCriterionScore } from "@wunderstack/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { roleplaySessions } from "./roleplay-sessions.js";

/**
 * The rubric outcome for one session. Unique per session: a re-review replaces the row rather than
 * accumulating, which is also what keeps result delivery idempotent.
 *
 * `weightedScore` is recomputed in code from `criterionScores`, never taken from the model — an LLM
 * asked to weight and average its own scores gets it wrong often enough to matter, and this number
 * is what ends up in a customer's LMS.
 */
export const roleplayReviews = pgTable(
  "roleplay_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => roleplaySessions.id, { onDelete: "cascade" }),
    criterionScores: jsonb("criterion_scores").$type<RoleplayCriterionScore[]>().notNull(),
    // mode: "number" — drizzle hands back a string otherwise, and a score that silently becomes
    // "7.50" is exactly the value that must not need parsing at the delivery boundary.
    weightedScore: numeric("weighted_score", { precision: 4, scale: 2, mode: "number" }).notNull(),
    passed: boolean("passed").notNull(),
    feedbackSummary: text("feedback_summary").notNull(),
    /** Which model and prompt build produced this judgement (AI Act traceability). */
    reviewModel: text("review_model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("roleplay_reviews_session_uq").on(table.sessionId),
    check(
      "roleplay_reviews_weighted_score_range",
      sql`weighted_score >= 0 AND weighted_score <= 10`,
    ),
  ],
);

export type RoleplayReview = typeof roleplayReviews.$inferSelect;
export type NewRoleplayReview = typeof roleplayReviews.$inferInsert;
