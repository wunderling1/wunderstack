import {
  and,
  desc,
  eq,
  gte,
  gt,
  interactionEvents,
  isNotNull,
  lt,
  roleplaySessions,
  sql,
  withFundSchema,
  type Database,
} from "@wunderstack/db";
import { isGroundedAgentKey } from "@wunderstack/shared";

import { RETRIEVAL_STRONG_MIN_SCORE } from "./retrieval-strength.js";

/**
 * S18: identical literal questions only surface as a signal group when they occur at least
 * this many times in the *filtered* slice. Narrowing agent / period / theme is a WHERE before
 * GROUP BY; HAVING still uses this constant, so a slice with fewer copies returns empty rather
 * than the remaining individual event rows.
 *
 * Applied in `packages/analytics/src/signals.ts` on the `.having(...)` of `loadQuestionSignals`.
 */
export const SIGNAL_MIN_OCCURRENCES = 3;

export const SIGNAL_LIST_LIMIT = 50;

export interface SignalsQuery {
  /** Fund whose schema to open (`withFundSchema`). Not a column filter. */
  fundKey: string;
  since: Date;
  until?: Date;
  agentId?: string;
  /** Optional theme WHERE. Dormant until a classifier exists — param is kept for future use. */
  theme?: string;
  /** Admin-only: load refused + retrieval strength `strong`. */
  includeSuspicious?: boolean;
  /** Sort clock for frequency × recency. Defaults to now. */
  now?: Date;
}

export interface QuestionSignal {
  /** Literal question text from the event-log. Never a generated theme or summary. */
  question: string;
  occurrenceCount: number;
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
  knowledgeGaps: QuestionSignal[];
  suspiciousRefusals: QuestionSignal[];
  exerciseAdoption: ExerciseAdoptionRow[];
}

type RefusalStrengthFilter = "none" | "strong";

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
  if (query.agentId !== undefined) {
    parts.push(eq(interactionEvents.agentId, query.agentId));
  }
  if (query.theme !== undefined) {
    parts.push(eq(interactionEvents.theme, query.theme));
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
  if (strength === "none") {
    return eq(interactionEvents.retrievedCount, 0);
  }
  return and(
    gt(interactionEvents.retrievedCount, 0),
    gte(interactionEvents.topScore, RETRIEVAL_STRONG_MIN_SCORE),
  );
}

/**
 * Query-layer gate (S18). Groups below the threshold are dropped — never ungrouped into
 * per-event rows. Used after SQL HAVING as defense in depth, and by tests that simulate a
 * narrowing (agent + period + theme) that leaves too few copies.
 */
export function groupsAtOccurrenceThreshold<T extends { occurrenceCount: number }>(
  groups: T[],
  min = SIGNAL_MIN_OCCURRENCES,
): T[] {
  return groups.filter((row) => row.occurrenceCount >= min);
}

/** Frequency × recency: more copies of a recent question rank above many stale copies. */
export function frequencyRecencyScore(
  occurrenceCount: number,
  lastOccurredAt: Date,
  now: Date,
): number {
  const ageDays = Math.max(0, (now.getTime() - lastOccurredAt.getTime()) / 86_400_000);
  return occurrenceCount / (1 + ageDays);
}

export function sortByFrequencyRecency<T extends { occurrenceCount: number; lastOccurredAt: Date }>(
  rows: T[],
  now: Date,
): T[] {
  return [...rows].sort((a, b) => {
    const diff =
      frequencyRecencyScore(b.occurrenceCount, b.lastOccurredAt, now) -
      frequencyRecencyScore(a.occurrenceCount, a.lastOccurredAt, now);
    if (diff !== 0) return diff;
    return b.lastOccurredAt.getTime() - a.lastOccurredAt.getTime();
  });
}

/** Map a grouped SQL row. Copies the question verbatim — no rewrite, no theme label. */
export function mapQuestionSignal(row: {
  question: string | null;
  occurrenceCount: unknown;
  lastOccurredAt: Date | string;
  latestEventId: string | null;
}): QuestionSignal | null {
  if (row.question === null || row.question === "" || row.latestEventId === null) return null;
  const lastOccurredAt = asDate(row.lastOccurredAt);
  if (lastOccurredAt === null) return null;
  return {
    question: row.question,
    occurrenceCount: toNumber(row.occurrenceCount),
    lastOccurredAt,
    latestEventId: row.latestEventId,
  };
}

export function includeExerciseAdoption(query: SignalsQuery): boolean {
  return query.agentId === undefined || !isGroundedAgentKey(query.agentId);
}

/** Groups that survive mapping and the threshold, ranked. Uncapped: the caller lists or counts. */
export function questionSignalsFrom(
  rows: Array<{
    question: string | null;
    occurrenceCount: unknown;
    lastOccurredAt: Date | string;
    latestEventId: string | null;
  }>,
  now: Date,
): QuestionSignal[] {
  const mapped = rows
    .map(mapQuestionSignal)
    .filter((row): row is QuestionSignal => row !== null);
  return sortByFrequencyRecency(groupsAtOccurrenceThreshold(mapped), now);
}

function selectQuestionGroups(
  db: Database,
  query: SignalsQuery,
  strength: RefusalStrengthFilter,
) {
  return db
    .select({
      question: interactionEvents.question,
      occurrenceCount: sql<number>`count(*)`,
      lastOccurredAt: sql<Date>`max(${interactionEvents.occurredAt})`,
      latestEventId: sql<string>`(array_agg(${interactionEvents.id} ORDER BY ${interactionEvents.occurredAt} DESC))[1]`,
    })
    .from(interactionEvents)
    .where(and(windowParts(query), strengthParts(strength)))
    .groupBy(interactionEvents.question)
    // S18: threshold lives in the query, not the UI. Narrowing cannot drop this HAVING.
    .having(sql`count(*) >= ${SIGNAL_MIN_OCCURRENCES}`)
    .orderBy(desc(sql`max(${interactionEvents.occurredAt})`));
}

async function loadQuestionSignals(
  db: Database,
  query: SignalsQuery,
  strength: RefusalStrengthFilter,
): Promise<QuestionSignal[]> {
  const rows = await selectQuestionGroups(db, query, strength);
  return questionSignalsFrom(rows, query.now ?? new Date()).slice(0, SIGNAL_LIST_LIMIT);
}

/**
 * How many knowledge gaps exist in this window — uncapped total from the same grouping and
 * threshold as the list. The Signalen list itself stops at {@link SIGNAL_LIST_LIMIT}.
 */
export async function countKnowledgeGaps(query: SignalsQuery): Promise<number> {
  return withFundSchema(query.fundKey, async (db) => {
    const rows = await selectQuestionGroups(db, query, "none");
    return questionSignalsFrom(rows, query.now ?? new Date()).length;
  });
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

/** Knowledge gaps, optional suspicious refusals, and exercise adoption — one fund-schema pass. */
export async function listSignals(query: SignalsQuery): Promise<SignalsResult> {
  return withFundSchema(query.fundKey, async (db) => {
    const knowledgeGaps = await loadQuestionSignals(db, query, "none");
    const suspiciousRefusals = query.includeSuspicious
      ? await loadQuestionSignals(db, query, "strong")
      : [];
    const exerciseAdoption = includeExerciseAdoption(query)
      ? await loadExerciseAdoption(db, query)
      : [];
    return { knowledgeGaps, suspiciousRefusals, exerciseAdoption };
  });
}
