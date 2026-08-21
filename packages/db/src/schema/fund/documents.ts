import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Source documents ingested into the RAG corpus. One row per ingested source (identified by
 * agent_key + source_uri). `agent_key` isolates corpora on the same fund (e.g. cao vs arbo).
 *
 * Unqualified table name: SET search_path selects the physical fund schema (`fund_<key>`).
 * `scripts/db/provision-fund.ts` / the PR5 migrator copies a fund into that schema and adds
 * CHECK (fund = '<key>') as a tripwire (not expressible in this shared drizzle table).
 *
 * `contentHash` (sha256 of the parsed source text) makes ingestion idempotent: re-running with
 * unchanged content is a no-op, a changed source triggers a deliberate re-embed. `(agent_key,
 * source_uri)` is unique so the same source can never produce duplicate document rows per agent.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The O&O fund / sector (control/data-plane key material).
    fund: text("fund").notNull(),
    /** Corpus agent key — isolates CAO vs arbocatalogus (and future agents) on the same fund. */
    agentKey: text("agent_key").notNull(),
    title: text("title").notNull(),
    sourceUri: text("source_uri").notNull(),
    version: text("version").notNull(),
    contentHash: text("content_hash").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("documents_agent_source_uri_uq").on(table.agentKey, table.sourceUri),
    index("documents_fund_agent_key_idx").on(table.fund, table.agentKey),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
