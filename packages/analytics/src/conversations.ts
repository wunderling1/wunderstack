import {
  and,
  desc,
  eq,
  gte,
  interactionEvents,
  lt,
  roleplaySessions,
  sql,
  withFundSchema,
  type Database,
} from "@wunderstack/db";
import {
  isGroundedAgentKey,
  refusedReasons,
  type RefusedReason,
  type RoleplayEndReason,
  type RoleplaySessionStatus,
  type TurnOutcomeValue,
} from "@wunderstack/shared";

import type { OutcomeBreakdown } from "./outcomes.js";

export const CONVERSATION_LIST_LIMIT = 50;

export interface ConversationQuery {
  /** Fund whose schema to open (`withFundSchema`). Not a column filter. */
  fundKey: string;
  since: Date;
  until?: Date;
  agentId?: string;
  outcome?: string;
  outcomeReason?: string;
}

export type GroundedConversation = {
  kind: "grounded";
  id: string;
  agentId: string;
  occurredAt: Date;
  question: string | null;
  outcome: string;
  outcomeReason: string | null;
  citationCount: number;
};

export type ExerciseConversation = {
  kind: "exercise";
  id: string;
  occurredAt: Date;
  scenarioSlug: string;
  turnsUsed: number;
  maxTurns: number;
  status: RoleplaySessionStatus;
  endReason: RoleplayEndReason | null;
};

export type ConversationItem = GroundedConversation | ExerciseConversation;

export interface ConversationList {
  items: ConversationItem[];
  /** Matching grounded turns (same predicate as the page, before the item cap). */
  groundedTotal: number;
  /** Matching exercise sessions (0 when an outcome/reason filter is set). */
  exerciseTotal: number;
}

function windowParts(query: ConversationQuery) {
  const parts = [gte(interactionEvents.occurredAt, query.since)];
  if (query.until !== undefined) {
    parts.push(lt(interactionEvents.occurredAt, query.until));
  }
  if (query.agentId !== undefined) {
    parts.push(eq(interactionEvents.agentId, query.agentId));
  }
  if (query.outcome !== undefined) {
    parts.push(eq(interactionEvents.outcome, query.outcome));
  }
  if (query.outcomeReason !== undefined) {
    parts.push(eq(interactionEvents.outcomeReason, query.outcomeReason));
  }
  return and(...parts);
}

function sessionWindowParts(query: { since: Date; until?: Date }) {
  const parts = [gte(roleplaySessions.startedAt, query.since)];
  if (query.until !== undefined) {
    parts.push(lt(roleplaySessions.startedAt, query.until));
  }
  return and(...parts);
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function asSessionStatus(value: string): RoleplaySessionStatus {
  return value === "ended" ? "ended" : "active";
}

function asEndReason(value: string | null): RoleplayEndReason | null {
  if (value === "completed" || value === "max_turns_reached" || value === "abandoned") {
    return value;
  }
  return null;
}

export function includeGroundedTurns(query: ConversationQuery): boolean {
  return query.agentId === undefined || isGroundedAgentKey(query.agentId);
}

/**
 * Exercise sessions have no turn outcome. Outcome/reason filters are grounded-only,
 * so they drop the exercise slice rather than invent a mapping.
 */
export function includeExerciseSessions(query: ConversationQuery): boolean {
  if (query.outcome !== undefined || query.outcomeReason !== undefined) return false;
  return query.agentId === undefined || !isGroundedAgentKey(query.agentId);
}

export function mapGroundedRow(row: {
  id: string;
  agentId: string;
  occurredAt: Date;
  question: string | null;
  outcome: string;
  outcomeReason: string | null;
  citationCount: number;
}): GroundedConversation {
  return {
    kind: "grounded",
    id: row.id,
    agentId: row.agentId,
    occurredAt: row.occurredAt,
    question: row.question,
    outcome: row.outcome,
    outcomeReason: row.outcomeReason,
    citationCount: toNumber(row.citationCount),
  };
}

export function mapExerciseRow(row: {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  scenarioSlug: string;
  turnsUsed: number;
  maxTurns: number;
  status: string;
  endReason: string | null;
}): ExerciseConversation {
  return {
    kind: "exercise",
    id: row.id,
    occurredAt: row.endedAt ?? row.startedAt,
    scenarioSlug: row.scenarioSlug,
    turnsUsed: toNumber(row.turnsUsed),
    maxTurns: toNumber(row.maxTurns),
    status: asSessionStatus(row.status),
    endReason: asEndReason(row.endReason),
  };
}

/**
 * Count from `getOutcomeBreakdown` for the same reason/outcome filter the list applies.
 * Null when the filter mixes in exercise sessions (no breakdown equivalent).
 */
export function breakdownCountForFilter(
  breakdown: OutcomeBreakdown,
  filter: { outcome?: string; outcomeReason?: string },
): number | null {
  if (filter.outcomeReason !== undefined) {
    if ((refusedReasons as readonly string[]).includes(filter.outcomeReason)) {
      return breakdown.refusedByReason[filter.outcomeReason as RefusedReason] ?? 0;
    }
    return null;
  }
  if (filter.outcome !== undefined) {
    const outcome = filter.outcome as TurnOutcomeValue;
    if (outcome in breakdown.byOutcome) {
      return breakdown.byOutcome[outcome];
    }
  }
  return null;
}

async function loadGrounded(
  db: Database,
  query: ConversationQuery,
): Promise<{ items: GroundedConversation[]; total: number }> {
  const scope = windowParts(query);
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: interactionEvents.id,
        agentId: interactionEvents.agentId,
        occurredAt: interactionEvents.occurredAt,
        question: interactionEvents.question,
        outcome: interactionEvents.outcome,
        outcomeReason: interactionEvents.outcomeReason,
        citationCount: interactionEvents.citationCount,
      })
      .from(interactionEvents)
      .where(scope)
      .orderBy(desc(interactionEvents.occurredAt))
      .limit(CONVERSATION_LIST_LIMIT),
    db
      .select({ n: sql<number>`count(*)` })
      .from(interactionEvents)
      .where(scope),
  ]);
  return {
    items: rows.map(mapGroundedRow),
    total: toNumber(countRows[0]?.n),
  };
}

async function loadExercises(
  db: Database,
  query: ConversationQuery,
): Promise<{ items: ExerciseConversation[]; total: number }> {
  const scope = sessionWindowParts(query);
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: roleplaySessions.id,
        startedAt: roleplaySessions.startedAt,
        endedAt: roleplaySessions.endedAt,
        scenarioSlug: roleplaySessions.scenarioSlug,
        turnsUsed: roleplaySessions.turnsUsed,
        maxTurns: roleplaySessions.maxTurns,
        status: roleplaySessions.status,
        endReason: roleplaySessions.endReason,
      })
      .from(roleplaySessions)
      .where(scope)
      .orderBy(desc(roleplaySessions.startedAt))
      .limit(CONVERSATION_LIST_LIMIT),
    db
      .select({ n: sql<number>`count(*)` })
      .from(roleplaySessions)
      .where(scope),
  ]);
  return {
    items: rows.map(mapExerciseRow),
    total: toNumber(countRows[0]?.n),
  };
}

async function loadConversationList(
  db: Database,
  query: ConversationQuery,
): Promise<ConversationList> {
  const grounded = includeGroundedTurns(query)
    ? await loadGrounded(db, query)
    : { items: [] as GroundedConversation[], total: 0 };
  const exercise = includeExerciseSessions(query)
    ? await loadExercises(db, query)
    : { items: [] as ExerciseConversation[], total: 0 };

  const items = [...grounded.items, ...exercise.items]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, CONVERSATION_LIST_LIMIT);

  return {
    items,
    groundedTotal: grounded.total,
    exerciseTotal: exercise.total,
  };
}

/** Fund-wide conversation list: grounded turns + exercise sessions, one window. */
export async function listConversations(query: ConversationQuery): Promise<ConversationList> {
  return withFundSchema(query.fundKey, (db) => loadConversationList(db, query));
}

export interface ExerciseActivity {
  sessionCount: number;
  lastStartedAt: Date | null;
}

/**
 * What an exercise agent did in one window: sessions started, most recent start. Read from the
 * session table only — an exercise agent has no outcome to break down, so a caller that wants its
 * volume asks here instead of narrowing `getOutcomeBreakdown` to a key that writes no events.
 */
export async function getExerciseActivity(query: {
  fundKey: string;
  since: Date;
  until?: Date;
}): Promise<ExerciseActivity> {
  return withFundSchema(query.fundKey, async (db) => {
    const scope = sessionWindowParts(query);
    const [countRows, lastRows] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(roleplaySessions).where(scope),
      db
        .select({ startedAt: roleplaySessions.startedAt })
        .from(roleplaySessions)
        .where(scope)
        .orderBy(desc(roleplaySessions.startedAt))
        .limit(1),
    ]);
    return {
      sessionCount: toNumber(countRows[0]?.n),
      lastStartedAt: lastRows[0]?.startedAt ?? null,
    };
  });
}

async function loadConversation(
  db: Database,
  id: string,
): Promise<ConversationItem | null> {
  const [event] = await db
    .select({
      id: interactionEvents.id,
      agentId: interactionEvents.agentId,
      occurredAt: interactionEvents.occurredAt,
      question: interactionEvents.question,
      outcome: interactionEvents.outcome,
      outcomeReason: interactionEvents.outcomeReason,
      citationCount: interactionEvents.citationCount,
    })
    .from(interactionEvents)
    .where(eq(interactionEvents.id, id))
    .limit(1);
  if (event) return mapGroundedRow(event);

  const [session] = await db
    .select({
      id: roleplaySessions.id,
      startedAt: roleplaySessions.startedAt,
      endedAt: roleplaySessions.endedAt,
      scenarioSlug: roleplaySessions.scenarioSlug,
      turnsUsed: roleplaySessions.turnsUsed,
      maxTurns: roleplaySessions.maxTurns,
      status: roleplaySessions.status,
      endReason: roleplaySessions.endReason,
    })
    .from(roleplaySessions)
    .where(eq(roleplaySessions.id, id))
    .limit(1);
  if (session) return mapExerciseRow(session);
  return null;
}

/** Permalink lookup: event id or exercise-session id, independent of the list window. */
export async function getConversation(
  fundKey: string,
  id: string,
): Promise<ConversationItem | null> {
  return withFundSchema(fundKey, (db) => loadConversation(db, id));
}
