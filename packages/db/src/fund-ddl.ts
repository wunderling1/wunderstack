/**
 * DDL for one physical fund schema. Track B: no CREATE ROLE — the schema is an
 * owner object. Isolation remains D15, not a Postgres role. No PARTITION, no HNSW.
 */

import { EMBEDDING_CONFIG } from "@wunderstack/shared";

import { quoteIdent, quoteLiteral } from "./ident.js";

const CHUNK_FK = "chunks_document_id_documents_id_fk";
const FUND_CHECK = "documents_fund_matches_key";

/** Per-schema version table. Not a global drizzle journal — one row-set per fund. */
export const FUND_MIGRATION_PROVISION = "0001_provision";

export function createSchemaSql(schemaName: string): string {
  return `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)}`;
}

export function createMigrationsTableSql(schemaName: string): string {
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;
}

export function createDocumentsLikeSql(schemaName: string): string {
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.documents (LIKE public.documents INCLUDING ALL)`;
}

export function createChunksLikeSql(schemaName: string): string {
  // INCLUDING CONSTRAINTS would copy the FK pointing at public.documents.
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.chunks (LIKE public.chunks INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)`;
}

export function createEventsLikeSql(schemaName: string): string {
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.interaction_events (LIKE public.interaction_events INCLUDING ALL)`;
}

export function addFundCheckSql(schemaName: string, fundKey: string): string[] {
  const table = `${quoteIdent(schemaName)}.documents`;
  return [
    `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${FUND_CHECK}`,
    `ALTER TABLE ${table} ADD CONSTRAINT ${FUND_CHECK} CHECK (fund = ${quoteLiteral(fundKey)})`,
  ];
}

export function addChunksFkSql(schemaName: string): string[] {
  const chunks = `${quoteIdent(schemaName)}.chunks`;
  const documents = `${quoteIdent(schemaName)}.documents`;
  return [
    `ALTER TABLE ${chunks} DROP CONSTRAINT IF EXISTS ${CHUNK_FK}`,
    `ALTER TABLE ${chunks} ADD CONSTRAINT ${CHUNK_FK} FOREIGN KEY (document_id) REFERENCES ${documents}(id) ON DELETE CASCADE`,
  ];
}

export function truncateFundTablesSql(schemaName: string): string {
  const q = quoteIdent(schemaName);
  return `TRUNCATE TABLE ${q}.chunks, ${q}.documents, ${q}.interaction_events CASCADE`;
}

export function copyDocumentsSql(schemaName: string, fundKey: string): string {
  return `INSERT INTO ${quoteIdent(schemaName)}.documents SELECT * FROM public.documents WHERE fund = ${quoteLiteral(fundKey)}`;
}

export function copyChunksSql(schemaName: string, fundKey: string): string {
  return `INSERT INTO ${quoteIdent(schemaName)}.chunks SELECT c.* FROM public.chunks c INNER JOIN public.documents d ON d.id = c.document_id WHERE d.fund = ${quoteLiteral(fundKey)}`;
}

export function copyEventsSql(schemaName: string, fundKey: string): string {
  return `INSERT INTO ${quoteIdent(schemaName)}.interaction_events SELECT * FROM public.interaction_events WHERE fund = ${quoteLiteral(fundKey)}`;
}

export function countTableSql(schemaName: string, table: string): string {
  return `SELECT count(*)::int AS n FROM ${quoteIdent(schemaName)}.${quoteIdent(table)}`;
}

export function recordMigrationSql(schemaName: string, id: string): string {
  return `INSERT INTO ${quoteIdent(schemaName)}.schema_migrations (id) VALUES (${quoteLiteral(id)}) ON CONFLICT (id) DO NOTHING`;
}

export function appliedMigrationsSql(schemaName: string): string {
  return `SELECT id FROM ${quoteIdent(schemaName)}.schema_migrations ORDER BY id`;
}

export function publicCorpusTablesSql(): string {
  return `
SELECT n.nspname, c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('documents', 'chunks', 'interaction_events')
ORDER BY c.relname
`.trim();
}

export function dropPublicCorpusSql(): string {
  return `DROP TABLE IF EXISTS public.chunks, public.documents, public.interaction_events`;
}

export function assertNoAnnOrPartitionSql(schemaName: string): string {
  return `
SELECT
  c.relname AS table_name,
  c.relkind,
  COALESCE((
    SELECT string_agg(i.indexdef, ' | ' ORDER BY i.indexdef)
    FROM pg_indexes i
    WHERE i.schemaname = ${quoteLiteral(schemaName)} AND i.tablename = c.relname
  ), '') AS indexdefs
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = ${quoteLiteral(schemaName)}
  AND c.relkind IN ('r', 'p')
  AND c.relname IN ('documents', 'chunks', 'interaction_events')
`.trim();
}

export function createDocumentsExplicitSql(schemaName: string): string {
  const q = quoteIdent(schemaName);
  return `CREATE TABLE IF NOT EXISTS ${q}.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund text NOT NULL,
  agent_key text NOT NULL,
  title text NOT NULL,
  source_uri text NOT NULL,
  version text NOT NULL,
  content_hash text NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now()
)`;
}

export function createChunksExplicitSql(schemaName: string): string {
  const q = quoteIdent(schemaName);
  return `CREATE TABLE IF NOT EXISTS ${q}.chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  ordinal integer NOT NULL,
  content text NOT NULL,
  chapter text,
  article text,
  lid text,
  source_ref text,
  chunk_type text NOT NULL DEFAULT 'text',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(${String(EMBEDDING_CONFIG.dim)}) NOT NULL,
  embedding_model text NOT NULL,
  embedding_dim integer NOT NULL,
  embedding_version text NOT NULL
)`;
}

export function createEventsExplicitSql(schemaName: string): string {
  const q = quoteIdent(schemaName);
  return `CREATE TABLE IF NOT EXISTS ${q}.interaction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  fund text NOT NULL,
  session_id text NOT NULL,
  user_id text,
  trace_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL,
  citation_count integer NOT NULL DEFAULT 0,
  question text,
  theme text,
  channel text,
  feedback text
)`;
}

export function fundTableIndexesSql(schemaName: string): string[] {
  const q = quoteIdent(schemaName);
  return [
    `CREATE UNIQUE INDEX IF NOT EXISTS documents_agent_source_uri_uq ON ${q}.documents (agent_key, source_uri)`,
    `CREATE INDEX IF NOT EXISTS documents_fund_agent_key_idx ON ${q}.documents (fund, agent_key)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS chunks_document_ordinal_uq ON ${q}.chunks (document_id, ordinal)`,
    `CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON ${q}.chunks (document_id)`,
    `CREATE INDEX IF NOT EXISTS interaction_events_tenant_occurred_idx ON ${q}.interaction_events (tenant_id, occurred_at)`,
    `CREATE INDEX IF NOT EXISTS interaction_events_fund_idx ON ${q}.interaction_events (fund)`,
    `CREATE INDEX IF NOT EXISTS interaction_events_session_idx ON ${q}.interaction_events (session_id)`,
    `CREATE INDEX IF NOT EXISTS interaction_events_trace_idx ON ${q}.interaction_events (trace_id)`,
    `CREATE INDEX IF NOT EXISTS interaction_events_channel_idx ON ${q}.interaction_events (channel)`,
  ];
}

export function revokePublicFundSchemaSql(schemaName: string): string[] {
  const q = quoteIdent(schemaName);
  return [
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${q} FROM PUBLIC`,
    `REVOKE USAGE ON SCHEMA ${q} FROM PUBLIC`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${q} REVOKE SELECT ON TABLES FROM PUBLIC`,
  ];
}

export function provisionDdl(schemaName: string, fundKey: string, likePublic = true): string[] {
  const tables = likePublic
    ? [createDocumentsLikeSql(schemaName), createChunksLikeSql(schemaName), createEventsLikeSql(schemaName)]
    : [
        createDocumentsExplicitSql(schemaName),
        createChunksExplicitSql(schemaName),
        createEventsExplicitSql(schemaName),
        ...fundTableIndexesSql(schemaName),
      ];
  return [
    createSchemaSql(schemaName),
    createMigrationsTableSql(schemaName),
    ...tables,
    ...addFundCheckSql(schemaName, fundKey),
    ...addChunksFkSql(schemaName),
  ];
}
