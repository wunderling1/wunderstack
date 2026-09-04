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
  type Database,
} from "@wunderstack/db";

import { mapPool } from "./map-pool";
import { asDate } from "./outcome-activity";

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
  /** Turn-budget / aborted generation — not a corpus refusal. */
  timeouts: number;
  /**
   * answeredWithCitations / qualityN, in [0,1]. qualityN excludes timeout and error so a hung
   * generation cannot dilute the v1 quality rate (or inflate a refusal rate).
   */
  answeredWithCitationsRate: number;
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function toSummary(row: {
  total?: unknown;
  answeredWithCitations?: unknown;
  refused?: unknown;
  clarified?: unknown;
  errors?: unknown;
  timeouts?: unknown;
  qualityN?: unknown;
} | undefined): KpiSummary {
  const total = toNumber(row?.total);
  const answeredWithCitations = toNumber(row?.answeredWithCitations);
  const qualityN = toNumber(row?.qualityN);
  return {
    total,
    answeredWithCitations,
    refused: toNumber(row?.refused),
    clarified: toNumber(row?.clarified),
    errors: toNumber(row?.errors),
    timeouts: toNumber(row?.timeouts),
    answeredWithCitationsRate: qualityN === 0 ? 0 : answeredWithCitations / qualityN,
  };
}

async function loadKpiSummary(db: Database, window: KpiWindow): Promise<KpiSummary> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      answeredWithCitations: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'answered' and ${interactionEvents.citationCount} > 0)`,
      refused: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'refused')`,
      clarified: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'clarified')`,
      errors: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'error' and ${interactionEvents.outcomeReason} in ('provider_error', 'aborted'))`,
      timeouts: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'error' and ${interactionEvents.outcomeReason} = 'timeout')`,
      qualityN: sql<number>`count(*) filter (where ${interactionEvents.outcome} not in ('error', 'unknown'))`,
    })
    .from(interactionEvents)
    .where(windowScope(window));
  return toSummary(row);
}

async function loadTopThemes(db: Database, window: KpiWindow, limit: number): Promise<ThemeCount[]> {
  const rows = await db
    .select({ theme: interactionEvents.theme, count: sql<number>`count(*)` })
    .from(interactionEvents)
    .where(and(windowScope(window), isNotNull(interactionEvents.theme)))
    .groupBy(interactionEvents.theme)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return rows
    .filter((row): row is { theme: string; count: number } => row.theme !== null)
    .map((row) => ({ theme: row.theme, count: toNumber(row.count) }));
}

export async function loadRecentInteractions(
  db: Database,
  window: KpiWindow,
  limit: number,
): Promise<InteractionLogRow[]> {
  const rows = await db
    .select({
      occurredAt: interactionEvents.occurredAt,
      question: interactionEvents.question,
      outcome: interactionEvents.outcome,
      citationCount: interactionEvents.citationCount,
    })
    .from(interactionEvents)
    .where(windowScope(window))
    .orderBy(desc(interactionEvents.occurredAt))
    .limit(limit);

  return rows.map((row) => ({
    occurredAt: row.occurredAt,
    question: row.question,
    outcome: row.outcome,
    citationCount: toNumber(row.citationCount),
  }));
}

async function loadUnansweredQuestions(
  db: Database,
  window: KpiWindow,
  limit: number,
): Promise<UnansweredQuestion[]> {
  const rows = await db
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
    .limit(limit);

  return rows
    .filter((row): row is { question: string; occurredAt: Date } => row.question !== null)
    .map((row) => ({ question: row.question, occurredAt: row.occurredAt }));
}

/** Aggregate outcome counts for a fund over a time window. */
export async function getKpiSummary(window: KpiWindow): Promise<KpiSummary> {
  return withFundSchema(window.fundKey, (db) => loadKpiSummary(db, window));
}

export interface ThemeCount {
  theme: string;
  count: number;
}

/** Top themes by volume (null until a classifier populates `theme`; returns [] meanwhile). */
export async function getTopThemes(window: KpiWindow, limit = 10): Promise<ThemeCount[]> {
  return withFundSchema(window.fundKey, (db) => loadTopThemes(db, window, limit));
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
  return withFundSchema(window.fundKey, (db) => loadRecentInteractions(db, window, limit));
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
  return withFundSchema(window.fundKey, (db) => loadUnansweredQuestions(db, window, limit));
}

export interface FundOverviewLimits {
  unanswered?: number;
  themes?: number;
  log?: number;
}

export interface FundOverview {
  summary: KpiSummary;
  unanswered: UnansweredQuestion[];
  themes: ThemeCount[];
  log: InteractionLogRow[];
}

/**
 * Fund overview panels in one `withFundSchema` transaction (one BEGIN + SET LOCAL + COMMIT).
 * postgres.js cannot pipeline concurrent queries on a single connection, so the four selects
 * run sequentially — cheaper than four parallel transactions that each occupy a pool slot.
 */
export async function getFundOverview(
  window: KpiWindow,
  limits: FundOverviewLimits = {},
): Promise<FundOverview> {
  const unansweredLimit = limits.unanswered ?? 20;
  const themeLimit = limits.themes ?? 10;
  const logLimit = limits.log ?? 25;
  return withFundSchema(window.fundKey, async (db) => {
    const summary = await loadKpiSummary(db, window);
    const unanswered = await loadUnansweredQuestions(db, window, unansweredLimit);
    const themes = await loadTopThemes(db, window, themeLimit);
    const log = await loadRecentInteractions(db, window, logLimit);
    return { summary, unanswered, themes, log };
  });
}

export interface AgentOverview {
  summary: KpiSummary;
  log: InteractionLogRow[];
}

/** Agent overview: summary + recent log in one fund-schema transaction. */
export async function getAgentOverview(
  window: KpiWindow,
  logLimit = 25,
): Promise<AgentOverview> {
  return withFundSchema(window.fundKey, async (db) => {
    const summary = await loadKpiSummary(db, window);
    const log = await loadRecentInteractions(db, window, logLimit);
    return { summary, log };
  });
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
  lastOccurredAt: Date | null;
}

/**
 * Parallel fund-schema reads for `getAgentActivity`. Matches the dev reader-pool size (3);
 * production has 10. Unbounded `Promise.all` would stall other dashboard queries.
 */
const FUND_SCHEMA_READ_CONCURRENCY = 3;

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
  const perFund = await mapPool(funds, FUND_SCHEMA_READ_CONCURRENCY, async (fund) => {
    const rows = await withFundSchema(fund.key, (db) =>
      db
        .select({
          tenantId: interactionEvents.tenantId,
          agentId: interactionEvents.agentId,
          fund: interactionEvents.fund,
          total: sql<number>`count(*)`,
          answeredWithCitations: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'answered' and ${interactionEvents.citationCount} > 0)`,
          refused: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'refused')`,
          // Ops health: timeouts and provider faults are not corpus refusals.
          errors: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'error')`,
          lastOccurredAt: sql<string>`max(${interactionEvents.occurredAt})`,
        })
        .from(interactionEvents)
        .where(gte(interactionEvents.occurredAt, since))
        .groupBy(interactionEvents.tenantId, interactionEvents.agentId, interactionEvents.fund),
    );
    return rows.map((row) => ({
      fundKey: fund.key,
      tenantId: row.tenantId,
      agentId: row.agentId,
      fund: row.fund,
      total: toNumber(row.total),
      answeredWithCitations: toNumber(row.answeredWithCitations),
      refused: toNumber(row.refused),
      errors: toNumber(row.errors),
      lastOccurredAt: asDate(row.lastOccurredAt),
    }));
  });
  const all = perFund.flat();
  all.sort((a, b) => b.total - a.total);
  return all;
}
