import { sql } from "drizzle-orm";
import { check, jsonb, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { control } from "./schema.js";

/**
 * One embeddable agent instance per (tenant_id, agent_key). Public key is a public identifier
 * (sits in the embed snippet), not a secret — rotate it to revoke without rebuilding the row.
 *
 * `schemaName` points at the fund data-plane schema (`fund_<key>`). `connectionKey` is an opaque
 * identifier for a future promotion path — never a URL. Resolve a DSN only via `resolveConnection`
 * from env (`WUNDERSTACK_DB_URL_<KEY>`). Unused on the request path until promotion is a real
 * requirement (ADR D2). Never log a resolved DSN.
 *
 * This table is never GRANTed to PUBLIC (`users.password_hash` and this row are dashboard-login
 * only). See migration 0014 and scripts/check-grants.sh.
 */
export const agentInstances = control.table(
  "agent_instances",
  {
    tenantId: text("tenant_id").notNull(),
    /** Catalog agent id for this instance (e.g. cao | arbo). */
    agentKey: text("agent_key").notNull(),
    publicKey: text("public_key").notNull(),
    schemaName: text("schema_name").notNull(),
    /** Opaque key; CHECK rejects '://'. Null = shared addon. Never a DSN. */
    connectionKey: text("connection_key"),
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
    check(
      "agent_instances_connection_key_not_url",
      sql`connection_key IS NULL OR position('://' in connection_key) = 0`,
    ),
  ],
);

export type AgentInstance = typeof agentInstances.$inferSelect;
export type NewAgentInstance = typeof agentInstances.$inferInsert;
