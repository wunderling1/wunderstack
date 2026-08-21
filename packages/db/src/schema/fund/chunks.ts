import { EMBEDDING_CONFIG } from "@wunderstack/shared";
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";

import { documents } from "./documents.js";

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
    // Structure metadata from CAO-aware chunking (Fase 10). Nullable: not every source is a
    // cleanly structured CAO, and a chunk may sit above the article/lid level (e.g. a chapter
    // intro). `sourceRef` is the human-readable citation anchor ("Artikel 5, lid 2").
    chapter: text("chapter"),
    article: text("article"),
    lid: text("lid"),
    sourceRef: text("source_ref"),
    // "text" (prose) or "table" (a serialized salary/scale table kept whole). Default keeps
    // pre-Fase-10 rows valid. Drives table-aware handling downstream.
    chunkType: text("chunk_type").notNull().default("text"),
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

export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
