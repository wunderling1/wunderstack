import { EMBEDDING_CONFIG } from "@wunderstack/shared";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * CAO source documents. One row per ingested CAO source (identified by source_uri).
 *
 * `contentHash` (sha256 of the parsed source text) makes ingestion idempotent: re-running with
 * unchanged content is a no-op, a changed source triggers a deliberate re-embed. `source_uri`
 * is unique so the same source can never produce duplicate document rows.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The O&O fund / sector this CAO belongs to (control/data-plane key material).
    fund: text("fund").notNull(),
    title: text("title").notNull(),
    sourceUri: text("source_uri").notNull(),
    version: text("version").notNull(),
    contentHash: text("content_hash").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("documents_source_uri_uq").on(table.sourceUri)],
);

/**
 * Chunks of a document with their embedding vector.
 *
 * The embedding dimension comes from EMBEDDING_CONFIG (pinned by the Fase 3 bake-off:
 * qwen3-embedding-8b @ 4096), so the schema stays the single source of truth. Changing
 * EMBEDDING_CONFIG.dim changes this column and forces a new migration — that is the explicit,
 * deliberate re-embed the rules require (see .cursor/rules/400-data-rag.mdc).
 *
 * NOTE: 4096 > pgvector's 2000-dim limit for hnsw/ivfflat, so there is deliberately NO ANN
 * index on `embedding`; retrieval uses exact (flat) search. The embedding-metadata columns are
 * NOT NULL so a re-embed is always detectable per row.
 */
export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    embedding: vector("embedding", { dimensions: EMBEDDING_CONFIG.dim }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingDim: integer("embedding_dim").notNull(),
    embeddingVersion: text("embedding_version").notNull(),
  },
  (table) => [
    uniqueIndex("chunks_document_ordinal_uq").on(table.documentId, table.ordinal),
    index("chunks_document_id_idx").on(table.documentId),
  ],
);

/**
 * Per-fund configuration for an agent (control-plane = agent code, data-plane = this row).
 * v1 holds a single public row; multi-tenancy is out of scope.
 */
export const agentConfig = pgTable(
  "agent_config",
  {
    agentKey: text("agent_key").notNull(),
    fundKey: text("fund_key").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [primaryKey({ columns: [table.agentKey, table.fundKey] })],
);

/**
 * Labelled evaluation cases (question -> expected passage). Seeds the eval suite (Fase 8);
 * starts from the bake-off's labelled set (Fase 3).
 */
export const evalCases = pgTable("eval_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  expectedPassage: text("expected_passage").notNull(),
  tags: text("tags").array().notNull().default([]),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
export type AgentConfig = typeof agentConfig.$inferSelect;
export type NewAgentConfig = typeof agentConfig.$inferInsert;
export type EvalCase = typeof evalCases.$inferSelect;
export type NewEvalCase = typeof evalCases.$inferInsert;
