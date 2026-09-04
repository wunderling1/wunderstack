import type { RoleplayDifficultyMap, RoleplayRubric } from "@wunderstack/shared";
import { sql } from "drizzle-orm";
import { check, integer, jsonb, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { control } from "./schema";

/**
 * One authored roleplay scenario per (fund_key, slug). Control plane, not fund schema: a scenario is
 * configuration an admin writes, like `agent_config` — the *sessions* it produces are fund data.
 *
 * Flat by design (DECISION-roleplay-agent.md, R2): no reusable persona/situation blocks, no
 * per-scenario overrides, no visibility levels. Qonvo needs that indirection because one library
 * serves many organisations; one fund per runtime (D15) does not.
 *
 * There is no `agent_key` column. Roleplay is one agent, and a second roleplay agent on one fund is
 * not a case that exists — adding the column later is cheaper than carrying a constant.
 *
 * `version` bumps on every content change so `roleplay_sessions.scenario_version` says which text a
 * finished session actually ran on. The snapshot on the session is the authoritative record; this
 * number is the human-readable handle for it.
 */
export const roleplayScenarios = control.table(
  "roleplay_scenarios",
  {
    fundKey: text("fund_key").notNull(),
    slug: text("slug").notNull(),

    title: text("title").notNull(),
    description: text("description").notNull().default(""),

    /** The role the agent plays (e.g. "boze klant"); the persona speaks as this. */
    partnerRole: text("partner_role").notNull(),
    /** The role the learner plays; used to frame the situation, never spoken by the agent. */
    userRole: text("user_role").notNull(),
    userTitle: text("user_title").notNull().default(""),

    /**
     * Persona instructions. Phrase as "Jij speelt de rol van …", never "Je bent <naam>": the latter
     * reads as a description of the *learner*, after which the model starts addressing the learner
     * by the persona name (Qonvo migration 058_fix_persona_role_framing).
     */
    persona: text("persona").notNull(),
    contextDescription: text("context_description").notNull(),
    /**
     * What the persona knows but will not volunteer. The prompt forbids revealing this unprompted;
     * without that rule the model hands over its whole subtext in the opening line.
     */
    hiddenInformation: text("hidden_information").notNull().default(""),

    learningObjective: text("learning_objective").notNull(),
    secondaryObjective: text("secondary_objective").notNull().default(""),
    commonPitfalls: text("common_pitfalls").array().notNull().default([]),

    /** Conversation rules layered on top of the persona (tone, hard limits, escalation). */
    instructions: text("instructions").notNull().default(""),
    openingLine: text("opening_line").notNull(),
    endCondition: text("end_condition").notNull().default(""),
    maxTurns: integer("max_turns").notNull().default(12),

    /**
     * Learner-facing preparation text. Deliberately NOT sent to the model: it describes the exercise
     * to the participant, and feeding it to the persona leaks the intent of the assignment.
     */
    briefing: text("briefing").notNull().default(""),

    rubric: jsonb("rubric").$type<RoleplayRubric>().notNull(),
    difficulties: jsonb("difficulties").$type<RoleplayDifficultyMap>().notNull().default({}),

    status: text("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.fundKey, table.slug] }),
    check(
      "roleplay_scenarios_status_known",
      sql`status IN ('draft', 'published', 'archived')`,
    ),
    check("roleplay_scenarios_max_turns_range", sql`max_turns BETWEEN 1 AND 100`),
    check("roleplay_scenarios_version_positive", sql`version >= 1`),
  ],
);

export type RoleplayScenario = typeof roleplayScenarios.$inferSelect;
export type NewRoleplayScenario = typeof roleplayScenarios.$inferInsert;
