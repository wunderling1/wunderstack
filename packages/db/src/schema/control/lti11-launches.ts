import { text, timestamp, uuid } from "drizzle-orm/pg-core";

import { lti11Consumers } from "./lti11-consumers.js";
import { control } from "./schema.js";

/**
 * Pending LTI 1.1 launch. The signed session token points here (`lid`); the row is the authority.
 *
 * `lti_user_id` is an opaque HMAC of the LMS `user_id`, not a users FK — Wunderstack has no learner
 * accounts (R3). Names and emails from the launch are never stored. Outcome fields feed the Fase 7
 * outbox as `result_target.kind = "lti11"` when the consumer has grade passback enabled.
 *
 * TTL is 4 hours, matching the session-token TTL.
 */
export const lti11Launches = control.table("lti11_launches", {
  id: uuid("id").primaryKey().defaultRandom(),
  consumerId: uuid("consumer_id")
    .notNull()
    .references(() => lti11Consumers.id, { onDelete: "cascade" }),
  ltiUserId: text("lti_user_id").notNull(),
  resourceLinkId: text("resource_link_id"),
  contextId: text("context_id"),
  outcomeServiceUrl: text("outcome_service_url"),
  resultSourcedId: text("result_sourcedid"),
  scenarioSlug: text("scenario_slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /**
   * Set on the first successful roleplay start for this launch. A second start with the same
   * token must not overwrite the LMS grade via replaceResult (single-use launch).
   */
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});

export type Lti11Launch = typeof lti11Launches.$inferSelect;
export type NewLti11Launch = typeof lti11Launches.$inferInsert;
