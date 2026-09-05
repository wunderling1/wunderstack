import {
  and,
  desc,
  eq,
  gte,
  gt,
  inArray,
  interactionEvents,
  isNotNull,
  lt,
  not,
  or,
  roleplaySessions,
  sql,
  withFundSchema,
  type Database,
} from "@wunderstack/db";
import { isGroundedAgentKey } from "@wunderstack/shared";

import { UNTHREADED_CHANNELS } from "./conversation-boundary";
import { loadMeasurementStartedAt } from "./outcomes";
import { RETRIEVAL_STRONG_MIN_SCORE } from "./retrieval-strength";

export const SIGNAL_LIST_LIMIT = 50;

export interface SignalsQuery {
  /** Fund whose schema to open (`withFundSchema`). Not a column filter. */
  fundKey: string;
  since: Date;
  until?: Date;
  agentKey?: string;
  /** Admin-only: load guard refusals and strong `no_coverage` (A3'). */
  includeSuspicious?: boolean;
  /** 1-based page for the knowledge-gap list. Defaults to 1. */
  page?: number;
  /** Clock for "now" defaults. Defaults to the real clock. */
  now?: Date;
}

export type CorpusHint = "none" | "thin";

export interface QuestionSignal {
  /**
   * Most common literal wording in the group (`mode()`). Never a generated theme or summary.
   */
  question: string;
  occurrenceCount: number;
  /**
   * Distinct visitors for this group. Threaded channels count `session_id`; mcp/api count each
   * event so a reused API session id cannot collapse many callers into one.
   */
  distinctActors: number;
  agentKey: string;
  /** `none` = every turn had zero hits; `thin` = at least one turn cleared minScore but stayed weak. */
  corpusHint: CorpusHint;
  lastOccurredAt: Date;
  /** Most recent event id — permalink target. */
  latestEventId: string;
}

export interface ExerciseAdoptionRow {
  scenarioSlug: string;
  sessionCount: number;
  abandonedCount: number;
  completedCount: number;
  maxTurnsReachedCount: number;
  lastStartedAt: Date;
  latestSessionId: string;
  latestAbandonedId: string | null;
}

export interface SignalsResult {
  /** D6 measurement start, read in this same transaction — the page shows it above the lists. */
  measurementStartedAt: Date | null;
  knowledgeGaps: QuestionSignal[];
  /**
   * Uncapped question count for the knowledge-gap WHERE — the headline number. Independent of
   * grouping, so it cannot drift when normalisation changes.
   */
  knowledgeGapsTotal: number;
  /** Same WHERE over the immediately preceding window of equal length. */
  previousKnowledgeGapsTotal: number;
  /** Groups before the page slice — drives pagination bounds. */
  knowledgeGapsGroupTotal: number;
  /** Top three groups by frequency — for the above-the-fold block, independent of page. */
  topKnowledgeGaps: QuestionSignal[];
  /** All questions in the window (any outcome) — empty-state copy. */
  questionsAsked: number;
  /** Answered questions in the window — empty-state copy. */
  questionsAnswered: number;
  suspiciousRefusals: QuestionSignal[];
  exerciseAdoption: ExerciseAdoptionRow[];
}

type RefusalStrengthFilter = "gap" | "admin";

/** Typed coverage reasons — always on the fund list, even with strong retrieval (A3'). */
const TYPED_COVERAGE_REASONS = ["out_of_domain", "out_of_scope", "partial_evidence"] as const;

const GUARD_REASONS = ["guard_hard_fact", "guard_citation_coupling"] as const;

/** Strong retrieval: hits exist and the top score clears the platform floor. */
function isStrongRetrieval() {
  return and(
    gt(interactionEvents.retrievedCount, 0),
    gte(interactionEvents.topScore, RETRIEVAL_STRONG_MIN_SCORE),
  )!;
}

function isTypedCoverageReason() {
  return inArray(interactionEvents.outcomeReason, [...TYPED_COVERAGE_REASONS]);
}

function isGuardReason() {
  return inArray(interactionEvents.outcomeReason, [...GUARD_REASONS]);
}

function isNoCoverageReason() {
  return eq(interactionEvents.outcomeReason, "no_coverage");
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" && value.length > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Near-literal key: lowercase, strip punctuation, collapse whitespace. Shared by the GROUP BY
 * expression and tests that assert two wordings collapse.
 */
export function normalizeQuestionKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** SQL fragment matching {@link normalizeQuestionKey} for GROUP BY. */
function normalizedQuestionSql() {
  return sql`lower(trim(regexp_replace(regexp_replace(${interactionEvents.question}, '[^[:alnum:][:space:]]', '', 'g'), '\\s+', ' ', 'g')))`;
}

/**
 * Corpus hint for a group: every turn had zero hits → `none`; otherwise something cleared the
 * agent floor but stayed below the strong threshold → `thin`.
 */
export function corpusHintFromGroup(noneCount: number, occurrenceCount: number): CorpusHint {
  if (occurrenceCount <= 0) return "none";
  return noneCount === occurrenceCount ? "none" : "thin";
}

function windowParts(query: SignalsQuery) {
  const parts = [
    gte(interactionEvents.occurredAt, query.since),
    isNotNull(interactionEvents.question),
    eq(interactionEvents.outcome, "refused"),
    isNotNull(interactionEvents.outcomeReason),
  ];
  if (query.until !== undefined) {
    parts.push(lt(interactionEvents.occurredAt, query.until));
  }
  if (query.agentKey !== undefined) {
    parts.push(eq(interactionEvents.agentKey, query.agentKey));
  }
  return and(...parts);
}

function sessionWindowParts(query: SignalsQuery) {
  const parts = [gte(roleplaySessions.startedAt, query.since)];
  if (query.until !== undefined) {
    parts.push(lt(roleplaySessions.startedAt, query.until));
  }
  return and(...parts);
}

function strengthParts(strength: RefusalStrengthFilter) {
  // A3': fund list = typed coverage (any strength) OR weak/zero `no_coverage`.
  // Admin list = guards (any strength) OR strong `no_coverage`. The two filters are not
  // negations of each other — typed coverage with strong retrieval is on the fund list.
  if (strength === "gap") {
    return or(isTypedCoverageReason(), and(isNoCoverageReason(), not(isStrongRetrieval())))!;
  }
  return or(isGuardReason(), and(isNoCoverageReason(), isStrongRetrieval()))!;
}

/** Frequency first, then recency. The primary sort the knowledge-gap page promises. */
export function sortByFrequencyThenRecency<
  T extends { occurrenceCount: number; lastOccurredAt: Date },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.occurrenceCount !== a.occurrenceCount) return b.occurrenceCount - a.occurrenceCount;
    return b.lastOccurredAt.getTime() - a.lastOccurredAt.getTime();
  });
}

/** Map a grouped SQL row. Keeps the mode() wording — no rewrite, no theme label. */
export function mapQuestionSignal(row: {
  question: string | null;
  occurrenceCount: unknown;
  distinctActors: unknown;
  agentKey: string | null;
  noneCount: unknown;
  lastOccurredAt: Date | string;
  latestEventId: string | null;
}): QuestionSignal | null {
  if (
    row.question === null ||
    row.question === "" ||
    row.latestEventId === null ||
    row.agentKey === null ||
    row.agentKey === ""
  ) {
    return null;
  }
  const lastOccurredAt = asDate(row.lastOccurredAt);
  if (lastOccurredAt === null) return null;
  const occurrenceCount = toNumber(row.occurrenceCount);
  return {
    question: row.question,
    occurrenceCount,
    distinctActors: toNumber(row.distinctActors),
    agentKey: row.agentKey,
    corpusHint: corpusHintFromGroup(toNumber(row.noneCount), occurrenceCount),
    lastOccurredAt,
    latestEventId: row.latestEventId,
  };
}

export function includeExerciseAdoption(query: SignalsQuery): boolean {
  return query.agentKey === undefined || !isGroundedAgentKey(query.agentKey);
}

/** Groups that survive mapping, ranked. Uncapped: the caller pages or counts. */
export function questionSignalsFrom(
  rows: Array<{
    question: string | null;
    occurrenceCount: unknown;
    distinctActors: unknown;
    agentKey: string | null;
    noneCount: unknown;
    lastOccurredAt: Date | string;
    latestEventId: string | null;
  }>,
): QuestionSignal[] {
  const mapped = rows
    .map(mapQuestionSignal)
    .filter((row): row is QuestionSignal => row !== null);
  return sortByFrequencyThenRecency(mapped);
}

function actorKeySql() {
  // Prefixes keep event-id and session-id namespaces apart so they never collide as one "user".
  const unthreaded = sql.join(
    UNTHREADED_CHANNELS.map((channel) => sql`${channel}`),
    sql`, `,
  );
  return sql`case
    when ${interactionEvents.channel} in (${unthreaded}) then 'e:' || ${interactionEvents.id}::text
    else 's:' || ${interactionEvents.sessionId}
  end`;
}

function selectQuestionGroups(
  db: Database,
  query: SignalsQuery,
  strength: RefusalStrengthFilter,
  bounds?: { limit: number; offset?: number },
) {
  const key = normalizedQuestionSql();
  const base = db
    .select({
      question: sql<string>`mode() within group (order by ${interactionEvents.question})`,
      occurrenceCount: sql<number>`count(*)`,
      distinctActors: sql<number>`count(distinct ${actorKeySql()})`,
      agentKey: interactionEvents.agentKey,
      noneCount: sql<number>`count(*) filter (where ${interactionEvents.retrievedCount} = 0)`,
      lastOccurredAt: sql<Date>`max(${interactionEvents.occurredAt})`,
      latestEventId: sql<string>`(array_agg(${interactionEvents.id} ORDER BY ${interactionEvents.occurredAt} DESC))[1]`,
    })
    .from(interactionEvents)
    .where(and(windowParts(query), strengthParts(strength)))
    .groupBy(key, interactionEvents.agentKey)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${interactionEvents.occurredAt})`));
  if (bounds === undefined) {
    return base;
  }
  const limited = base.limit(bounds.limit);
  return bounds.offset !== undefined && bounds.offset > 0 ? limited.offset(bounds.offset) : limited;
}

async function loadRankedQuestionSignals(
  db: Database,
  query: SignalsQuery,
  strength: RefusalStrengthFilter,
  bounds?: { limit: number; offset?: number },
): Promise<QuestionSignal[]> {
  const rows = await selectQuestionGroups(db, query, strength, bounds);
  return questionSignalsFrom(rows);
}

async function loadQuestionSignals(
  db: Database,
  query: SignalsQuery,
  strength: RefusalStrengthFilter,
): Promise<QuestionSignal[]> {
  return loadRankedQuestionSignals(db, query, strength, { limit: SIGNAL_LIST_LIMIT });
}

/** How many near-literal groups match the filter — drives pagination bounds (D10). */
async function loadQuestionGroupCount(
  db: Database,
  query: SignalsQuery,
  strength: RefusalStrengthFilter,
): Promise<number> {
  const key = normalizedQuestionSql();
  const grouped = db
    .select({ marker: sql`1`.mapWith(Number) })
    .from(interactionEvents)
    .where(and(windowParts(query), strengthParts(strength)))
    .groupBy(key, interactionEvents.agentKey)
    .as("signal_groups");
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(grouped);
  return toNumber(row?.total);
}

/**
 * Uncapped question count for the knowledge-gap WHERE — same filter the list uses, independent of
 * grouping. This is the headline number on Overzicht and Signalen.
 */
export async function loadKnowledgeGapCount(db: Database, query: SignalsQuery): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(interactionEvents)
    .where(and(windowParts(query), strengthParts("gap")));
  return toNumber(row?.total);
}

export async function countKnowledgeGaps(query: SignalsQuery): Promise<number> {
  return withFundSchema(query.fundKey, (db) => loadKnowledgeGapCount(db, query));
}

function previousWindowBounds(query: SignalsQuery, now: Date): { since: Date; until: Date } {
  const until = query.until ?? now;
  const durationMs = until.getTime() - query.since.getTime();
  return {
    since: new Date(query.since.getTime() - durationMs),
    until: query.since,
  };
}

async function loadWindowQuestionTotals(
  db: Database,
  query: SignalsQuery,
): Promise<{ asked: number; answered: number }> {
  const parts = [gte(interactionEvents.occurredAt, query.since)];
  if (query.until !== undefined) {
    parts.push(lt(interactionEvents.occurredAt, query.until));
  }
  if (query.agentKey !== undefined) {
    parts.push(eq(interactionEvents.agentKey, query.agentKey));
  }
  const [row] = await db
    .select({
      asked: sql<number>`count(*)`,
      answered: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'answered')`,
    })
    .from(interactionEvents)
    .where(and(...parts));
  return { asked: toNumber(row?.asked), answered: toNumber(row?.answered) };
}

async function loadExerciseAdoption(
  db: Database,
  query: SignalsQuery,
): Promise<ExerciseAdoptionRow[]> {
  const rows = await db
    .select({
      scenarioSlug: roleplaySessions.scenarioSlug,
      sessionCount: sql<number>`count(*)`,
      abandonedCount: sql<number>`count(*) filter (where ${roleplaySessions.endReason} = 'abandoned')`,
      completedCount: sql<number>`count(*) filter (where ${roleplaySessions.endReason} = 'completed')`,
      maxTurnsReachedCount: sql<number>`count(*) filter (where ${roleplaySessions.endReason} = 'max_turns_reached')`,
      lastStartedAt: sql<Date>`max(${roleplaySessions.startedAt})`,
      latestSessionId: sql<string>`(array_agg(${roleplaySessions.id} ORDER BY ${roleplaySessions.startedAt} DESC))[1]`,
      latestAbandonedId: sql<string | null>`(array_agg(${roleplaySessions.id} ORDER BY ${roleplaySessions.startedAt} DESC) FILTER (WHERE ${roleplaySessions.endReason} = 'abandoned'))[1]`,
    })
    .from(roleplaySessions)
    .where(sessionWindowParts(query))
    .groupBy(roleplaySessions.scenarioSlug)
    .orderBy(desc(sql`count(*) filter (where ${roleplaySessions.endReason} = 'abandoned')`));

  return rows
    .filter((row) => row.latestSessionId !== null)
    .map((row) => {
      const lastStartedAt = asDate(row.lastStartedAt);
      if (lastStartedAt === null) return null;
      return {
        scenarioSlug: row.scenarioSlug,
        sessionCount: toNumber(row.sessionCount),
        abandonedCount: toNumber(row.abandonedCount),
        completedCount: toNumber(row.completedCount),
        maxTurnsReachedCount: toNumber(row.maxTurnsReachedCount),
        lastStartedAt,
        latestSessionId: row.latestSessionId,
        latestAbandonedId: row.latestAbandonedId,
      };
    })
    .filter((row): row is ExerciseAdoptionRow => row !== null)
    .slice(0, SIGNAL_LIST_LIMIT);
}

/**
 * Knowledge gaps, their uncapped question total, optional suspicious refusals, exercise adoption
 * and the D6 measurement start — one fund-schema transaction.
 */
export async function listSignals(query: SignalsQuery): Promise<SignalsResult> {
  return withFundSchema(query.fundKey, async (db) => {
    const now = query.now ?? new Date();
    const page = Math.max(1, query.page ?? 1);
    const offset = (page - 1) * SIGNAL_LIST_LIMIT;
    const knowledgeGaps = await loadRankedQuestionSignals(db, query, "gap", {
      limit: SIGNAL_LIST_LIMIT,
      offset,
    });
    const knowledgeGapsGroupTotal = await loadQuestionGroupCount(db, query, "gap");
    const topKnowledgeGaps = await loadRankedQuestionSignals(db, query, "gap", { limit: 3 });
    const knowledgeGapsTotal = await loadKnowledgeGapCount(db, query);
    const previous = previousWindowBounds(query, now);
    const previousKnowledgeGapsTotal = await loadKnowledgeGapCount(db, {
      ...query,
      since: previous.since,
      until: previous.until,
    });
    const totals = await loadWindowQuestionTotals(db, query);
    const suspiciousRefusals = query.includeSuspicious
      ? await loadQuestionSignals(db, query, "admin")
      : [];
    const exerciseAdoption = includeExerciseAdoption(query)
      ? await loadExerciseAdoption(db, query)
      : [];
    const measurementStartedAt = await loadMeasurementStartedAt(db);
    return {
      measurementStartedAt,
      knowledgeGaps,
      knowledgeGapsTotal,
      previousKnowledgeGapsTotal,
      knowledgeGapsGroupTotal,
      topKnowledgeGaps,
      questionsAsked: totals.asked,
      questionsAnswered: totals.answered,
      suspiciousRefusals,
      exerciseAdoption,
    };
  });
}
