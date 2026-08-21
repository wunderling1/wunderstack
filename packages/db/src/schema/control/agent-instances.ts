import { jsonb, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { control } from "./schema.js";

/**
 * One embeddable agent instance per (tenant_id, agent_key). Public key is a public identifier
 * (sits in the embed snippet), not a secret — rotate it to revoke without rebuilding the row.
 *
 * `schemaName` points at the fund data-plane schema (`fund_<key>`). `connectionRef` empty means
 * the shared Postgres instance (promotion path: fill in to point at a dedicated addon).
 */
export const agentInstances = control.table(
  "agent_instances",
  {
    tenantId: text("tenant_id").notNull(),
    /** Catalog agent id for this instance (e.g. cao | arbo). */
    agentKey: text("agent_key").notNull(),
    publicKey: text("public_key").notNull(),
    schemaName: text("schema_name").notNull(),
    connectionRef: text("connection_ref"),
    status: text("status").notNull().default("active"),
    pinnedReleaseTag: text("pinned_release_tag"),
    corsAllowlist: text("cors_allowlist").array().notNull().default([]),
    theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
    texts: jsonb("texts").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.agentKey] }),
    uniqueIndex("agent_instances_public_key_uq").on(table.publicKey),
  ],
);

export type AgentInstance = typeof agentInstances.$inferSelect;
export type NewAgentInstance = typeof agentInstances.$inferInsert;
