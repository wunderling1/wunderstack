import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One roleplay conversation. Fund data (the scenario itself is control-plane configuration).
 *
 * `id` doubles as the Langfuse session id, following Qonvo's pseudonymity choice: tracing is keyed
 * on the conversation, never on a person. There is deliberately no `user_id` column — the roleplay
 * agent follows the same no-identity model as the grounded agents (DECISION-roleplay-agent.md, R3).
 *
 * `scenarioSnapshot` freezes the resolved scenario at start. The scenario may be edited or archived
 * later; the snapshot pins the exact text this session ran on, which is what makes a finished
 * session reproducible (AI Act). Existing snapshots are never rewritten — they record what the model
 * actually received, not what we would send today.
 *
 * The three `external*` columns plus `resultTarget` are the binding to whatever launched the session.
 * They are here from the start so webhook and LTI delivery become adapters rather than a migration
 * through the session model.
 */
export const roleplaySessions = pgTable(
  "roleplay_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Scenario reference. Not an FK: the scenario lives in `control`, this table in `fund_<key>`. */
    scenarioSlug: text("scenario_slug").notNull(),
    scenarioVersion: integer("scenario_version").notNull(),
    scenarioSnapshot: jsonb("scenario_snapshot").$type<Record<string, unknown>>().notNull(),
    /** Which prompt build produced this session; bumps when prompt text changes. */
    promptVersion: text("prompt_version").notNull(),
    /** Null when the scenario defines no difficulty modulation. */
    difficulty: text("difficulty"),

    status: text("status").notNull().default("active"),
    /** Null while active. Read by the reviewer prompt: running out of turns is judged differently. */
    endReason: text("end_reason"),
    turnsUsed: integer("turns_used").notNull().default(0),
    /** Copied from the scenario at start so a later edit cannot shorten a running conversation. */
    maxTurns: integer("max_turns").notNull(),

    origin: text("origin").notNull().default("embed"),
    /** Opaque pseudonym from the launching platform. Never a name or an email address (R3). */
    externalUserRef: text("external_user_ref"),
    /** Opaque course/context id from the launching platform. */
    externalContextRef: text("external_context_ref"),
    /** Where this session's result must be delivered; shape depends on the adapter. */
    resultTarget: jsonb("result_target").$type<Record<string, unknown>>(),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /**
     * Set when a process claims the review. First-write-wins across runtimes: a second claim loses
     * so two model calls cannot overwrite each other's grade after one delivery already left.
     * Cleared on review failure so a later POST can retry (R4).
     */
    reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
  },
  (table) => [
    index("roleplay_sessions_status_idx").on(table.status),
    index("roleplay_sessions_scenario_idx").on(table.scenarioSlug),
    index("roleplay_sessions_started_idx").on(table.startedAt),
    index("roleplay_sessions_external_user_idx").on(table.externalUserRef),
    check("roleplay_sessions_status_known", sql`status IN ('active', 'ended')`),
    check(
      "roleplay_sessions_end_reason_known",
      sql`end_reason IS NULL OR end_reason IN ('completed', 'max_turns_reached', 'abandoned')`,
    ),
    check(
      "roleplay_sessions_origin_known",
      sql`origin IN ('embed', 'webhook', 'lti11', 'lti13')`,
    ),
    // An ended session must say why, and an active one must not pretend it stopped.
    check(
      "roleplay_sessions_end_reason_matches_status",
      sql`(status = 'ended') = (end_reason IS NOT NULL)`,
    ),
    check("roleplay_sessions_turns_within_max", sql`turns_used BETWEEN 0 AND max_turns`),
    check("roleplay_sessions_max_turns_range", sql`max_turns BETWEEN 1 AND 100`),
  ],
);

export type RoleplaySession = typeof roleplaySessions.$inferSelect;
export type NewRoleplaySession = typeof roleplaySessions.$inferInsert;
