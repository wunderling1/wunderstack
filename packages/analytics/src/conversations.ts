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

import {
  groupIntoConversations,
  isThreadedChannel,
  type ConversationGroup,
} from "./conversation-boundary.js";
import { loadOutcomeBreakdown, type OutcomeBreakdown } from "./outcomes.js";

/** Conversations (containers) listed on one page. */
export const CONVERSATION_LIST_LIMIT = 50;

/**
 * Ceiling on questions read per window before grouping. The outcome filter cannot be pushed into
 * SQL: a conversation matches when *one* of its questions does, and the card then shows the
 * questions around that one. So the window is read once and grouped in one place — the same place
 * the volume count uses, which is what keeps the list and the tile from drifting apart.
 *
 * Measured 1 September 2026: the busiest fund holds 224 rows in total, so this is headroom rather
 * than a limit anyone reaches. Paging is still undecided (audit O-5); when it lands, this goes.
 */
export const CONVERSATION_TURN_SCAN_CAP = 5000;

export interface ConversationQuery {
  /** Fund whose schema to open (`withFundSchema`). Not a column filter. */
  fundKey: string;
  since: Date;
  until?: Date;
  agentId?: string;
  outcome?: string;
  outcomeReason?: string;
}

/** One turn: the unit an outcome, its reason and its citations belong to (S22). */
export interface ConversationQuestion {
  /** Event id — this is what a permalink addresses and anchors on. */
  id: string;
  occurredAt: Date;
  question: string | null;
  outcome: string;
  outcomeReason: string | null;
  citationCount: number;
  channel: string | null;
  /** True when this question is the one the active outcome/reason filter selected. */
  matchesFilter: boolean;
}

/**
 * A conversation: one visitor, one agent, one or more questions in a row (S22). It has a course,
 * not an outcome — the outcome lives on each question.
 */
export type GroundedConversation = {
  kind: "grounded";
  /** First question's event id. Window-dependent; see ConversationGroup.id. */
  id: string;
  agentId: string;
  startedAt: Date;
  /** Last question — the list sorts on this. */
  occurredAt: Date;
  /** False when no question came in over a channel that carries a thread id (mcp, api). */
  threaded: boolean;
  questions: ConversationQuestion[];
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
  /**
   * Window + agent breakdown, unaffected by the outcome/reason filter — the page prints a filtered
   * count against it. Read in the list's own transaction: same scope, same rows, no second BEGIN.
   */
  breakdown: OutcomeBreakdown;
  /** Questions matching the filter — the KPI unit (S22). */
  questionTotal: number;
  /** Conversations holding at least one matching question. */
  conversationTotal: number;
  /** Matching exercise sessions (0 when an outcome/reason filter is set). */
  exerciseTotal: number;
  /** True when the turn scan cap was hit — counts and grouping are then a floor. */
  truncated: boolean;
}

/** What the Activity block needs beyond the question count it already has (S22). */
export interface ConversationVolume {
  /** Conversations the window's questions fall into (S22/D10). */
  conversations: number;
  /** Questions on a channel that carries no thread id: each is its own conversation. */
  unthreadedQuestions: number;
  /** True when the scan cap was hit — `conversations` is then a floor, not an exact count. */
  truncated: boolean;
}

const questionColumns = {
  id: interactionEvents.id,
  sessionId: interactionEvents.sessionId,
  agentId: interactionEvents.agentId,
  occurredAt: interactionEvents.occurredAt,
  question: interactionEvents.question,
  outcome: interactionEvents.outcome,
  outcomeReason: interactionEvents.outcomeReason,
  citationCount: interactionEvents.citationCount,
  channel: interactionEvents.channel,
};

type TurnRow = {
  id: string;
  sessionId: string;
  agentId: string;
  occurredAt: Date;
  question: string | null;
  outcome: string;
  outcomeReason: string | null;
  citationCount: number;
  channel: string | null;
};

/** Window + agent scope only. The outcome filter is applied after grouping, never here. */
function scopeParts(query: { since: Date; until?: Date; agentId?: string }) {
  const parts = [gte(interactionEvents.occurredAt, query.since)];
  if (query.until !== undefined) {
    parts.push(lt(interactionEvents.occurredAt, query.until));
  }
  if (query.agentId !== undefined) {
    parts.push(eq(interactionEvents.agentId, query.agentId));
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

/** `max(...)` goes through drizzle `sql`, not the column mapper, so postgres.js yields a string. */
function asDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
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

export function hasOutcomeFilter(query: {
  outcome?: string;
  outcomeReason?: string;
}): boolean {
  return query.outcome !== undefined || query.outcomeReason !== undefined;
}

/** Does this question satisfy the active outcome/reason filter? No filter means every question. */
export function matchesOutcomeFilter(
  row: { outcome: string; outcomeReason: string | null },
  filter: { outcome?: string; outcomeReason?: string },
): boolean {
  if (filter.outcome !== undefined && row.outcome !== filter.outcome) return false;
  if (filter.outcomeReason !== undefined && row.outcomeReason !== filter.outcomeReason) {
    return false;
  }
  return true;
}

export function mapQuestionRow(
  row: {
    id: string;
    occurredAt: Date;
    question: string | null;
    outcome: string;
    outcomeReason: string | null;
    citationCount: number;
    channel?: string | null;
  },
  matchesFilter = false,
): ConversationQuestion {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    question: row.question,
    outcome: row.outcome,
    outcomeReason: row.outcomeReason,
    citationCount: toNumber(row.citationCount),
    channel: row.channel ?? null,
    matchesFilter,
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

/** Group → conversation. `questions` is non-empty by construction, so the first row is the start. */
export function toGroundedConversation(
  group: ConversationGroup<TurnRow>,
  filter: { outcome?: string; outcomeReason?: string } = {},
): GroundedConversation {
  const filterActive = hasOutcomeFilter(filter);
  const first = group.questions[0];
  const occurredAt = group.questions.reduce(
    (latest, row) => (row.occurredAt > latest ? row.occurredAt : latest),
    first.occurredAt,
  );
  return {
    kind: "grounded",
    id: group.id,
    agentId: group.agentId,
    startedAt: first.occurredAt,
    occurredAt,
    // Some, not every: one measured session mixes a pre-channel null with playground.
    threaded: group.questions.some((row) => isThreadedChannel(row.channel)),
    questions: group.questions.map((row) =>
      mapQuestionRow(row, filterActive && matchesOutcomeFilter(row, filter)),
    ),
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

function scanWindow(db: Database, query: { since: Date; until?: Date; agentId?: string }) {
  return db
    .select(questionColumns)
    .from(interactionEvents)
    .where(scopeParts(query))
    .orderBy(desc(interactionEvents.occurredAt))
    .limit(CONVERSATION_TURN_SCAN_CAP);
}

/**
 * The five columns {@link groupIntoConversations} needs. Counting conversations reads no question
 * text: pulling `question` for up to {@link CONVERSATION_TURN_SCAN_CAP} rows only to throw it away
 * is the cheapest thing on this page to stop doing.
 */
export const boundaryColumns = {
  id: interactionEvents.id,
  sessionId: interactionEvents.sessionId,
  agentId: interactionEvents.agentId,
  occurredAt: interactionEvents.occurredAt,
  channel: interactionEvents.channel,
};

export type BoundaryRow = {
  id: string;
  sessionId: string;
  agentId: string;
  occurredAt: Date;
  channel: string | null;
};

/** Boundary-column scan over one window, newest first, capped at `limit`. */
export function scanBoundaryWindow(
  db: Database,
  query: { since: Date; until?: Date; agentId?: string },
  limit: number = CONVERSATION_TURN_SCAN_CAP,
) {
  return db
    .select(boundaryColumns)
    .from(interactionEvents)
    .where(scopeParts(query))
    .orderBy(desc(interactionEvents.occurredAt))
    .limit(limit);
}

/** Conversations and unthreaded questions in one already-scanned set of boundary rows. */
export function volumeFromRows(rows: readonly BoundaryRow[], cap: number): ConversationVolume {
  return {
    conversations: groupIntoConversations(rows).length,
    unthreadedQuestions: rows.filter((row) => !isThreadedChannel(row.channel)).length,
    truncated: rows.length >= cap,
  };
}

async function loadGroundedConversations(
  db: Database,
  query: ConversationQuery,
): Promise<{
  items: GroundedConversation[];
  questionTotal: number;
  conversationTotal: number;
  truncated: boolean;
}> {
  const rows = await scanWindow(db, query);
  const truncated = rows.length >= CONVERSATION_TURN_SCAN_CAP;

  let questionTotal = 0;
  const selected: Array<ConversationGroup<TurnRow>> = [];

  for (const group of groupIntoConversations(rows)) {
    const matched = group.questions.filter((row) => matchesOutcomeFilter(row, query)).length;
    if (matched === 0) continue;
    questionTotal += matched;
    selected.push(group);
  }

  const items = selected
    .map((group) => toGroundedConversation(group, query))
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, CONVERSATION_LIST_LIMIT);

  return { items, questionTotal, conversationTotal: selected.length, truncated };
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
    ? await loadGroundedConversations(db, query)
    : {
        items: [] as GroundedConversation[],
        questionTotal: 0,
        conversationTotal: 0,
        truncated: false,
      };
  const exercise = includeExerciseSessions(query)
    ? await loadExercises(db, query)
    : { items: [] as ExerciseConversation[], total: 0 };

  const items: ConversationItem[] = [...grounded.items, ...exercise.items];

  const breakdown = await loadOutcomeBreakdown(db, {
    fundKey: query.fundKey,
    since: query.since,
    until: query.until,
    agentId: query.agentId,
  });

  return {
    items,
    breakdown,
    questionTotal: grounded.questionTotal,
    conversationTotal: grounded.conversationTotal,
    exerciseTotal: exercise.total,
    truncated: grounded.truncated,
  };
}

/** Fund-wide list: conversations with their questions, plus exercise sessions. One window. */
export async function listConversations(query: ConversationQuery): Promise<ConversationList> {
  return withFundSchema(query.fundKey, (db) => loadConversationList(db, query));
}

/**
 * How many conversations the window's questions fall into. Reads the same rows through the same
 * grouper as the list, so the Activity tile and the page it links to cannot disagree.
 */
export async function getConversationVolume(window: {
  fundKey: string;
  since: Date;
  until?: Date;
  agentId?: string;
}): Promise<ConversationVolume> {
  return withFundSchema(window.fundKey, async (db) => {
    const rows = await scanBoundaryWindow(db, window);
    return volumeFromRows(rows, CONVERSATION_TURN_SCAN_CAP);
  });
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
  return withFundSchema(query.fundKey, (db) => loadExerciseActivity(db, query));
}

/**
 * The same read, against a caller's open fund-schema transaction. Count and last start come from
 * one aggregate: postgres.js cannot pipeline two selects on one connection, so two would be two
 * round trips for one row.
 */
export async function loadExerciseActivity(
  db: Database,
  query: { since: Date; until?: Date },
): Promise<ExerciseActivity> {
  const [row] = await db
    .select({
      sessionCount: sql<number>`count(*)`,
      lastStartedAt: sql<Date | string | null>`max(${roleplaySessions.startedAt})`,
    })
    .from(roleplaySessions)
    .where(sessionWindowParts(query));
  return {
    sessionCount: toNumber(row?.sessionCount),
    lastStartedAt: asDate(row?.lastStartedAt),
  };
}

/**
 * The conversation one question belongs to, resolved without a window so a shared link never
 * depends on the period the sharer had selected (S16). The whole session+agent history is grouped
 * and the group holding this event is returned — which is why a 7-day list and a 30-day list can
 * link to the same conversation.
 */
async function loadConversationByQuestionId(
  db: Database,
  id: string,
): Promise<GroundedConversation | null> {
  const [anchor] = await db
    .select({
      sessionId: interactionEvents.sessionId,
      agentId: interactionEvents.agentId,
    })
    .from(interactionEvents)
    .where(eq(interactionEvents.id, id))
    .limit(1);
  if (!anchor) return null;

  const rows = await db
    .select(questionColumns)
    .from(interactionEvents)
    .where(
      and(
        eq(interactionEvents.sessionId, anchor.sessionId),
        eq(interactionEvents.agentId, anchor.agentId),
      ),
    )
    .orderBy(desc(interactionEvents.occurredAt))
    .limit(CONVERSATION_TURN_SCAN_CAP);

  const group = groupIntoConversations(rows).find((candidate) =>
    candidate.questions.some((row) => row.id === id),
  );
  return group === undefined ? null : toGroundedConversation(group);
}

async function loadConversation(db: Database, id: string): Promise<ConversationItem | null> {
  const conversation = await loadConversationByQuestionId(db, id);
  if (conversation) return conversation;

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

/** Permalink lookup: a question id or an exercise-session id, independent of the list window. */
export async function getConversation(
  fundKey: string,
  id: string,
): Promise<ConversationItem | null> {
  return withFundSchema(fundKey, (db) => loadConversation(db, id));
}
