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
 * Source documents ingested into the RAG corpus. One row per ingested source (identified by
 * agent_key + source_uri). `agent_key` isolates corpora on the same fund (e.g. cao vs arbo).
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

/**
 * One row per user interaction with an agent (Fase 1 event-log). This is the analytics fact table
 * the dashboard reads (via @wunderstack/analytics + the read-only `analytics_reader` role), kept
 * separate from Langfuse: Langfuse is per-trace debugging, this is the durable product-metrics log
 * that lives in the fund's own database.
 *
 * Identity model (D15): `tenantId` is the instance/deployment key, `fund` the customer-domain word
 * (1-to-1 in v1). `sessionId` is shared with the Langfuse trace so one identity model spans both.
 * `userId` is nullable — embed end-users are pseudonymous (no identification in v1, AVG). `question`
 * is logged to drive the "unanswered questions" corpus-roadmap signal; retention is 90 days (see
 * docs/decisions/DECISION-analytics-retention.md). `feedback` is filled in later by the feedback
 * endpoint, matched on `traceId`.
 */
export const interactionEvents = pgTable(
  "interaction_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    agentId: text("agent_id").notNull(),
    // Data-plane key (the fund whose corpus answered). Kept alongside tenantId for per-fund KPIs.
    fund: text("fund").notNull(),
    sessionId: text("session_id").notNull(),
    // Nullable: embed end-users are pseudonymous in v1 (no identification, AVG).
    userId: text("user_id"),
    // Langfuse trace id for this answer; links the durable event to per-trace debugging and lets the
    // feedback endpoint attach a signal after the fact. Null when tracing is unconfigured.
    traceId: text("trace_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    // "answered" | "refused" | "clarified" | "error" — the outcome of the turn.
    outcome: text("outcome").notNull(),
    citationCount: integer("citation_count").notNull().default(0),
    // Potentially-sensitive free text; logged for the corpus-roadmap signal, 90-day retention.
    question: text("question"),
    // Coarse theme metadata (roadmap signal). Null until a classifier exists (deferred, regel van drie).
    theme: text("theme"),
    // Surface that produced the turn (playground | embed | mcp | api). Null for pre-channel events.
    channel: text("channel"),
    // "up" | "down"; filled in by the feedback endpoint, matched on traceId. Null = no feedback given.
    feedback: text("feedback"),
  },
  (table) => [
    index("interaction_events_tenant_occurred_idx").on(table.tenantId, table.occurredAt),
    index("interaction_events_fund_idx").on(table.fund),
    index("interaction_events_session_idx").on(table.sessionId),
    index("interaction_events_trace_idx").on(table.traceId),
    index("interaction_events_channel_idx").on(table.channel),
  ],
);

/**
 * Dashboard users (Fase 3). Backs Auth.js Credentials login for `apps/dashboard`.
 *
 * Roles: `admin` (Wunderling, cross-tenant, `tenantId` is null) and `fund` (scoped to exactly one
 * tenant via `tenantId`, the D15 technical key). Passwords are stored as a self-describing
 * `scrypt$<salt>$<hash>` string (node:crypto scrypt — no external hashing dependency). This table is
 * written only out-of-band by the `create-user` seed script (using the read-write role); the
 * dashboard itself connects read-only and only SELECTs for login.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    // "admin" (cross-tenant) | "fund" (scoped to tenantId).
    role: text("role").notNull(),
    // Null for admin; the tenant a fund user is scoped to (D15 key).
    tenantId: text("tenant_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

/**
 * Per-tenant embed configuration (Fase 4). Lives on the fondsinstance; drives the embeddable widget.
 *
 * - `publicKey` is the embed's public tenant-key (safe to expose; access is gated by CORS + rate
 *   limiting, not key secrecy). Rotating it invalidates old snippets.
 * - `corsAllowlist` are the origins allowed to call the API with this key (browser cross-origin).
 * - `theme` / `texts` are the curated token subset + NL copy served by `GET /config` (D17 runtime
 *   theming — replaces the compile-time `[data-fund]` seam as the product mechanism).
 *
 * Written only by the console via the `tenant_config_writer` role (or DATABASE_URL locally); read by
 * the runtime (`GET /config`) and the dashboard.
 */
export const tenantConfig = pgTable(
  "tenant_config",
  {
    tenantId: text("tenant_id").notNull(),
    /** Catalog agent id for this instance (e.g. cao | arbo). */
    agentKey: text("agent_key").notNull(),
    publicKey: text("public_key").notNull(),
    corsAllowlist: text("cors_allowlist").array().notNull().default([]),
    theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
    texts: jsonb("texts").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.agentKey] }),
    uniqueIndex("tenant_config_public_key_uq").on(table.publicKey),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
export type AgentConfig = typeof agentConfig.$inferSelect;
export type NewAgentConfig = typeof agentConfig.$inferInsert;
export type EvalCase = typeof evalCases.$inferSelect;
export type NewEvalCase = typeof evalCases.$inferInsert;
export type InteractionEvent = typeof interactionEvents.$inferSelect;
export type NewInteractionEvent = typeof interactionEvents.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type TenantConfig = typeof tenantConfig.$inferSelect;
export type NewTenantConfig = typeof tenantConfig.$inferInsert;
