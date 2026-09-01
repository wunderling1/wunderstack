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

/** Roleplay tables + turn counter. Applied to existing schemas by `migrate-fund-schemas`. */
export const FUND_MIGRATION_ROLEPLAY = "0002_roleplay";

/** Turn outcome classification columns on `interaction_events` (PR-A2). */
export const FUND_MIGRATION_TURN_OUTCOME = "0003_turn_outcome";

/** Repair path: add outcome CHECK when a fund was provisioned before CREATE included it. */
export const FUND_MIGRATION_OUTCOME_CHECK = "0004_outcome_check";

export const INTERACTION_EVENTS_OUTCOME_CHECK =
  "CHECK (outcome IN ('answered', 'refused', 'clarified', 'error', 'unknown'))";

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
  outcome_reason text,
  citation_count integer NOT NULL DEFAULT 0,
  retrieved_count integer NOT NULL DEFAULT 0,
  top_score double precision,
  question text,
  theme text,
  channel text,
  feedback text,
  CONSTRAINT interaction_events_outcome_check ${INTERACTION_EVENTS_OUTCOME_CHECK}
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
    // Postgres grants EXECUTE on new functions to PUBLIC by default; the turn counter writes.
    `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${q} FROM PUBLIC`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${q} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`,
  ];
}

/**
 * Roleplay tables for one fund schema. Sessions are fund data; the scenario they run is
 * control-plane configuration, so `scenario_slug` is a plain column and not a cross-schema FK.
 */
export function createRoleplayTablesSql(schemaName: string): string[] {
  const q = quoteIdent(schemaName);
  return [
    `CREATE TABLE IF NOT EXISTS ${q}.roleplay_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_slug text NOT NULL,
  scenario_version integer NOT NULL,
  scenario_snapshot jsonb NOT NULL,
  prompt_version text NOT NULL,
  difficulty text,
  status text NOT NULL DEFAULT 'active',
  end_reason text,
  turns_used integer NOT NULL DEFAULT 0,
  max_turns integer NOT NULL,
  origin text NOT NULL DEFAULT 'embed',
  external_user_ref text,
  external_context_ref text,
  result_target jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  review_started_at timestamptz,
  CONSTRAINT roleplay_sessions_status_known CHECK (status IN ('active', 'ended')),
  CONSTRAINT roleplay_sessions_end_reason_known CHECK (
    end_reason IS NULL OR end_reason IN ('completed', 'max_turns_reached', 'abandoned')
  ),
  CONSTRAINT roleplay_sessions_origin_known CHECK (
    origin IN ('embed', 'webhook', 'lti11', 'lti13')
  ),
  CONSTRAINT roleplay_sessions_end_reason_matches_status CHECK (
    (status = 'ended') = (end_reason IS NOT NULL)
  ),
  CONSTRAINT roleplay_sessions_turns_within_max CHECK (turns_used BETWEEN 0 AND max_turns),
  CONSTRAINT roleplay_sessions_max_turns_range CHECK (max_turns BETWEEN 1 AND 100)
)`,
    `CREATE TABLE IF NOT EXISTS ${q}.roleplay_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ${q}.roleplay_sessions(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roleplay_messages_role_known CHECK (role IN ('user', 'assistant')),
  CONSTRAINT roleplay_messages_ordinal_positive CHECK (ordinal >= 0)
)`,
    `CREATE TABLE IF NOT EXISTS ${q}.roleplay_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ${q}.roleplay_sessions(id) ON DELETE CASCADE,
  criterion_scores jsonb NOT NULL,
  weighted_score numeric(4, 2) NOT NULL,
  passed boolean NOT NULL,
  feedback_summary text NOT NULL,
  review_model text NOT NULL,
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roleplay_reviews_weighted_score_range CHECK (
    weighted_score >= 0 AND weighted_score <= 10
  )
)`,
    `CREATE TABLE IF NOT EXISTS ${q}.roleplay_result_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ${q}.roleplay_sessions(id) ON DELETE CASCADE,
  target jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roleplay_result_deliveries_status_known CHECK (
    status IN ('pending', 'delivered', 'failed')
  ),
  CONSTRAINT roleplay_result_deliveries_delivered_at_matches_status CHECK (
    (status = 'delivered') = (delivered_at IS NOT NULL)
  ),
  CONSTRAINT roleplay_result_deliveries_attempts_positive CHECK (attempts >= 0)
)`,
  ];
}

export function roleplayIndexesSql(schemaName: string): string[] {
  const q = quoteIdent(schemaName);
  return [
    `CREATE INDEX IF NOT EXISTS roleplay_sessions_status_idx ON ${q}.roleplay_sessions (status)`,
    `CREATE INDEX IF NOT EXISTS roleplay_sessions_scenario_idx ON ${q}.roleplay_sessions (scenario_slug)`,
    `CREATE INDEX IF NOT EXISTS roleplay_sessions_started_idx ON ${q}.roleplay_sessions (started_at)`,
    `CREATE INDEX IF NOT EXISTS roleplay_sessions_external_user_idx ON ${q}.roleplay_sessions (external_user_ref)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS roleplay_messages_session_ordinal_uq ON ${q}.roleplay_messages (session_id, ordinal)`,
    `CREATE INDEX IF NOT EXISTS roleplay_messages_session_idx ON ${q}.roleplay_messages (session_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS roleplay_reviews_session_uq ON ${q}.roleplay_reviews (session_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS roleplay_result_deliveries_session_uq ON ${q}.roleplay_result_deliveries (session_id)`,
    `CREATE INDEX IF NOT EXISTS roleplay_result_deliveries_due_idx ON ${q}.roleplay_result_deliveries (status, next_attempt_at)`,
  ];
}

/**
 * Claim one turn, atomically. Read-then-write loses a turn when two tabs post at the same time:
 * both read N, both write N+1 (Qonvo migration 059). Folding the `turns_used < max_turns` check into
 * the same UPDATE also closes the window where two concurrent turns each pass a separate pre-flight
 * check and together exceed the budget.
 *
 * Returns one row: the counter state plus whether this caller may proceed. `accepted = false` means
 * the session is finished or out of turns — do not charge a turn or call the model. **Zero rows**
 * means no such session; that is a different failure and must not be read as a refusal.
 *
 * Plain SQL, not plpgsql: `provisionDdl` must stay free of `BEGIN` (see fund-ddl.test.ts).
 *
 * Every column reference is alias-qualified. `RETURNS TABLE` declares OUT parameters named after the
 * columns they carry, and an unqualified `turns_used` in the body then depends on Postgres' name
 * resolution order to mean the column rather than the parameter. Qualifying makes that unresolvable
 * by construction instead of correct by precedent.
 */
export function createRoleplayTurnFunctionSql(schemaName: string): string {
  const q = quoteIdent(schemaName);
  return `CREATE OR REPLACE FUNCTION ${q}.claim_roleplay_turn(p_session_id uuid)
RETURNS TABLE (turns_used integer, max_turns integer, accepted boolean)
LANGUAGE sql
AS $$
  WITH claimed AS (
    UPDATE ${q}.roleplay_sessions AS s
       SET turns_used = s.turns_used + 1
     WHERE s.id = p_session_id
       AND s.status = 'active'
       AND s.turns_used < s.max_turns
    RETURNING s.turns_used, s.max_turns
  )
  SELECT c.turns_used, c.max_turns, true FROM claimed c
  UNION ALL
  SELECT s.turns_used, s.max_turns, false
    FROM ${q}.roleplay_sessions s
   WHERE s.id = p_session_id
     AND NOT EXISTS (SELECT 1 FROM claimed)
$$`;
}

/** Columns added after the first roleplay CREATE — IF NOT EXISTS so existing schemas catch up. */
export function roleplayAlterSql(schemaName: string): string[] {
  const q = quoteIdent(schemaName);
  return [
    `ALTER TABLE ${q}.roleplay_sessions ADD COLUMN IF NOT EXISTS review_started_at timestamptz`,
  ];
}

/** Columns added for PR-A2 turn-outcome classification — IF NOT EXISTS so existing schemas catch up. */
export function turnOutcomeAlterSql(schemaName: string): string[] {
  const q = quoteIdent(schemaName);
  return [
    `ALTER TABLE ${q}.interaction_events ADD COLUMN IF NOT EXISTS outcome_reason text`,
    `ALTER TABLE ${q}.interaction_events ADD COLUMN IF NOT EXISTS retrieved_count integer NOT NULL DEFAULT 0`,
    `ALTER TABLE ${q}.interaction_events ADD COLUMN IF NOT EXISTS top_score double precision`,
    // D3 cold-start: rewrite pre-metric rows once. The per-fund ledger prevents a second run — do not
    // re-apply this UPDATE against rows that already carry classified outcomes.
    `UPDATE ${q}.interaction_events SET outcome = 'unknown' WHERE outcome IS NOT NULL`,
    `ALTER TABLE ${q}.interaction_events DROP CONSTRAINT IF EXISTS interaction_events_outcome_check`,
    `ALTER TABLE ${q}.interaction_events ADD CONSTRAINT interaction_events_outcome_check CHECK (outcome IN ('answered', 'refused', 'clarified', 'error', 'unknown'))`,
  ];
}

/** Idempotent outcome CHECK for funds provisioned without it on CREATE (ledger 0004). */
export function outcomeCheckConstraintSql(schemaName: string): string[] {
  const q = quoteIdent(schemaName);
  return [
    `ALTER TABLE ${q}.interaction_events DROP CONSTRAINT IF EXISTS interaction_events_outcome_check`,
    `ALTER TABLE ${q}.interaction_events ADD CONSTRAINT interaction_events_outcome_check ${INTERACTION_EVENTS_OUTCOME_CHECK}`,
  ];
}

/** Everything the roleplay agent needs in a fund schema. Idempotent. */
export function roleplayDdl(schemaName: string): string[] {
  return [
    ...createRoleplayTablesSql(schemaName),
    ...roleplayAlterSql(schemaName),
    ...roleplayIndexesSql(schemaName),
    createRoleplayTurnFunctionSql(schemaName),
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
    // Roleplay has no public.* counterpart, so it is explicit in both branches.
    ...roleplayDdl(schemaName),
  ];
}
