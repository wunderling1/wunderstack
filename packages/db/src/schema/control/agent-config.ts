import { jsonb, primaryKey, text } from "drizzle-orm/pg-core";

import { control } from "./schema.js";

/**
 * Per-fund configuration for an agent (tuning knobs only: minScore, starters, corpus version).
 * One row per (agent_key, fund_key). Prompts and refusal sentences stay in code.
 */
export const agentConfig = control.table(
  "agent_config",
  {
    agentKey: text("agent_key").notNull(),
    fundKey: text("fund_key").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [primaryKey({ columns: [table.agentKey, table.fundKey] })],
);

export type AgentConfig = typeof agentConfig.$inferSelect;
export type NewAgentConfig = typeof agentConfig.$inferInsert;
