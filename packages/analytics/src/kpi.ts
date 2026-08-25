import {
  and,
  desc,
  eq,
  findFundsWithoutSchema,
  gte,
  interactionEvents,
  isNotNull,
  listActiveFunds,
  sql,
  withFundSchema,
} from "@wunderstack/db";

/**
 * KPI queries the dashboard consumes (Fase 3 reads these via the read-only `analytics_reader` role).
 * Kept intentionally small — the v1 dashboard shows question volume, the answered-with-verified-
 * citations rate, top themes and the unanswered-questions roadmap signal. No latency/token/model
 * metrics (those stay in Langfuse for internal use).
 *
 * FUND SCHEMA ISOLATION (D15, track B — ADR-multitenant-database).
 * Every fund-scoped query below opens the fund schema via `withFundSchema(fundKey, …)`. That
 * schema IS the scope: every row in `fund_<key>.interaction_events` belongs to that fund.
 * `tenant_id` on the row is deployment provenance (which runtime wrote it) and MUST NOT filter
 * KPIs — a multi-fund runtime writes its own tenant key while storing events in the answering
 * fund's schema. Filtering on `tenant_id` would drop those rows (F1). Isolation is NOT enforced
 * at the database: the RLS policy on `interaction_events` is `FOR SELECT TO PUBLIC USING (true)`
 * (see packages/db/migrations/0007_analytics_reader_policy.sql). CREATE ROLE is unavailable on
 * the addon, so do not collapse D15. Cross-fund aggregation belongs on control-plane counters,
 * never a SQL join across fund schemas. `getAgentActivity` is the deliberate cross-fund
 * exception and is admin-gated at the route; it returns `fundKey` (= schema source) so callers
 * never guess which fund a row belongs to.
 */

export interface KpiWindow {
  /** Fund whose schema to open (`withFundSchema`). Not a column filter. */
  fundKey: string;
  /** Only count events at or after this instant. */
  since: Date;
  /** When set, scope KPIs to a single agent instance. */
  agentId?: string;
}

function windowScope(window: KpiWindow) {
  const parts = [gte(interactionEvents.occurredAt, window.since)];
  if (window.agentId !== undefined) {
    parts.push(eq(interactionEvents.agentId, window.agentId));
  }
  return and(...parts);
}

export interface KpiSummary {
  total: number;
  /** Answered AND carrying at least one verified citation (the honest v1 "answered" measure). */
  answeredWithCitations: number;
  refused: number;
  clarified: number;
  errors: number;
  /** answeredWithCitations / total, in [0,1]; 0 when there are no events. */
  answeredWithCitationsRate: number;
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/** Aggregate outcome counts for a fund over a time window. */
export async function getKpiSummary(window: KpiWindow): Promise<KpiSummary> {
  const scope = windowScope(window);

  const [row] = await withFundSchema(window.fundKey, (db) =>
    db
      .select({
        total: sql<number>`count(*)`,
        answeredWithCitations: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'answered' and ${interactionEvents.citationCount} > 0)`,
        refused: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'refused')`,
        clarified: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'clarified')`,
        errors: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'error')`,
      })
      .from(interactionEvents)
      .where(scope),
  );

  const total = toNumber(row?.total);
  const answeredWithCitations = toNumber(row?.answeredWithCitations);
  return {
    total,
    answeredWithCitations,
    refused: toNumber(row?.refused),
    clarified: toNumber(row?.clarified),
    errors: toNumber(row?.errors),
    answeredWithCitationsRate: total === 0 ? 0 : answeredWithCitations / total,
  };
}

export interface ThemeCount {
  theme: string;
  count: number;
}

/** Top themes by volume (null until a classifier populates `theme`; returns [] meanwhile). */
export async function getTopThemes(window: KpiWindow, limit = 10): Promise<ThemeCount[]> {
  const rows = await withFundSchema(window.fundKey, (db) =>
    db
      .select({ theme: interactionEvents.theme, count: sql<number>`count(*)` })
      .from(interactionEvents)
      .where(
        and(
          windowScope(window),
          isNotNull(interactionEvents.theme),
        ),
      )
      .groupBy(interactionEvents.theme)
      .orderBy(desc(sql`count(*)`))
      .limit(limit),
  );

  return rows
    .filter((row): row is { theme: string; count: number } => row.theme !== null)
    .map((row) => ({ theme: row.theme, count: toNumber(row.count) }));
}

export interface InteractionLogRow {
  occurredAt: Date;
  question: string | null;
  outcome: string;
  citationCount: number;
}

/** Recent interactions for a fund — the fund query-log panel. */
export async function getRecentInteractions(
  window: KpiWindow,
  limit = 50,
): Promise<InteractionLogRow[]> {
  const rows = await withFundSchema(window.fundKey, (db) =>
    db
      .select({
        occurredAt: interactionEvents.occurredAt,
        question: interactionEvents.question,
        outcome: interactionEvents.outcome,
        citationCount: interactionEvents.citationCount,
      })
      .from(interactionEvents)
      .where(windowScope(window))
      .orderBy(desc(interactionEvents.occurredAt))
      .limit(limit),
  );

  return rows.map((row) => ({
    occurredAt: row.occurredAt,
    question: row.question,
    outcome: row.outcome,
    citationCount: toNumber(row.citationCount),
  }));
}

export interface AgentActivityRow {
  /** Schema the row was read from — the fund this activity belongs to. */
  fundKey: string;
  /** Deployment provenance (which runtime wrote the event). Not fund identity. */
  tenantId: string;
  agentId: string;
  fund: string;
  total: number;
  answeredWithCitations: number;
  refused: number;
  errors: number;
  lastOccurredAt: Date;
}

/**
 * Cross-fund agent activity since an instant — the admin agent-overview. Grouped by
 * (tenant, agent, fund); ordered by volume. Admin-only data (the dashboard gates the route).
 * Aggregated in the app, one query per fund schema — never a SQL join across schemas.
 * `fundKey` is the schema source so callers never re-derive fund membership from tenantId.
 * Throws when an active fund has no schema: that read would fall through to `public` and
 * report a broken fund as an empty one.
 */
export async function getAgentActivity(since: Date): Promise<AgentActivityRow[]> {
  const funds = await listActiveFunds();
  const missing = await findFundsWithoutSchema(funds);
  if (missing.length > 0) {
    throw new Error(
      `Active funds without a schema: ${missing.join(", ")}. Provisioning did not complete; ` +
        "reading on would silently return public-corpus rows for these funds.",
    );
  }
  const all: AgentActivityRow[] = [];
  for (const fund of funds) {
    const rows = await withFundSchema(fund.key, (db) =>
      db
        .select({
          tenantId: interactionEvents.tenantId,
          agentId: interactionEvents.agentId,
          fund: interactionEvents.fund,
          total: sql<number>`count(*)`,
          answeredWithCitations: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'answered' and ${interactionEvents.citationCount} > 0)`,
          refused: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'refused')`,
          errors: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'error')`,
          lastOccurredAt: sql<string>`max(${interactionEvents.occurredAt})`,
        })
        .from(interactionEvents)
        .where(gte(interactionEvents.occurredAt, since))
        .groupBy(interactionEvents.tenantId, interactionEvents.agentId, interactionEvents.fund),
    );
    for (const row of rows) {
      all.push({
        fundKey: fund.key,
        tenantId: row.tenantId,
        agentId: row.agentId,
        fund: row.fund,
        total: toNumber(row.total),
        answeredWithCitations: toNumber(row.answeredWithCitations),
        refused: toNumber(row.refused),
        errors: toNumber(row.errors),
        lastOccurredAt: new Date(row.lastOccurredAt),
      });
    }
  }
  all.sort((a, b) => b.total - a.total);
  return all;
}

export interface UnansweredQuestion {
  question: string;
  occurredAt: Date;
}

/**
 * Recent refused questions — the corpus-roadmap signal ("what are users asking that we can't
 * answer?"). Only rows that logged a question are returned.
 */
export async function getUnansweredQuestions(
  window: KpiWindow,
  limit = 50,
): Promise<UnansweredQuestion[]> {
  const rows = await withFundSchema(window.fundKey, (db) =>
    db
      .select({ question: interactionEvents.question, occurredAt: interactionEvents.occurredAt })
      .from(interactionEvents)
      .where(
        and(
          windowScope(window),
          eq(interactionEvents.outcome, "refused"),
          isNotNull(interactionEvents.question),
        ),
      )
      .orderBy(desc(interactionEvents.occurredAt))
      .limit(limit),
  );

  return rows
    .filter((row): row is { question: string; occurredAt: Date } => row.question !== null)
    .map((row) => ({ question: row.question, occurredAt: row.occurredAt }));
}
