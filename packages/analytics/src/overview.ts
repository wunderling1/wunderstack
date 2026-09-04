import {
  gte,
  interactionEvents,
  lt,
  roleplaySessions,
  sql,
  withFundSchema,
  type Database,
  type SQL,
} from "@wunderstack/db";

import {
  CONVERSATION_TURN_SCAN_CAP,
  loadExerciseActivity,
  scanBoundaryWindow,
  volumeFromRows,
  type BoundaryRow,
  type ConversationVolume,
  type ExerciseActivity,
} from "./conversations";
import { loadCorpusOverview, type CorpusDocRow } from "./corpus";
import { loadRecentInteractions, type InteractionLogRow } from "./kpi";
import { asDate } from "./outcome-activity";
import {
  breakdownCountSelect,
  breakdownFromRow,
  loadMeasurementStartedAt,
  loadOutcomeBreakdown,
  type BreakdownRow,
  type OutcomeBreakdown,
} from "./outcomes";
import { loadKnowledgeGapCount } from "./signals";

/**
 * The overview's reads, grouped the way the page renders them.
 *
 * Two rules shape this module, and they pull in the same direction:
 *
 * 1. **One transaction per snapshot.** `withFundSchema` is BEGIN + SET LOCAL search_path + query +
 *    COMMIT, so a read that lives alone costs four round trips for one useful one. Over a dev
 *    tunnel to the addon that is the dominant cost of a page. `kpi.ts` documented this for
 *    `getFundOverview`; the D6 rebuild lost it, and this module is where it comes back.
 * 2. **One pass per table.** Current and previous window are adjacent (`previous.until ===
 *    current.since`), so one scan over their union answers both through `filter (where ...)` —
 *    instead of two scans that read the same index twice.
 *
 * What did NOT change: every number is derived exactly as before. The window pair is still two
 * separate groupings, the scan cap is still per window, and no aggregate crosses a window boundary.
 */

export interface TimeWindow {
  since: Date;
  until: Date;
}

/** Current window plus the equal-length window immediately before it (no overlap). */
export interface WindowPair {
  current: TimeWindow;
  previous: TimeWindow;
}

export interface Pair<T> {
  current: T;
  previous: T;
}

export interface ActivitySnapshot {
  outcomes: Pair<OutcomeBreakdown>;
  volume: Pair<ConversationVolume>;
  exercise: Pair<ExerciseActivity>;
  measurementStartedAt: Date | null;
  /** Groups the Signalen list holds for the current window — what "N kennisgaten" counts (S11a). */
  knowledgeGaps: number;
}

/** One agent's slice of the window, in the grounded vocabulary. Exercise volume is read elsewhere. */
export interface AgentOutcomeRow {
  agentId: string;
  breakdown: OutcomeBreakdown;
  lastOccurredAt: Date | null;
}

export interface AgentSnapshot {
  /** Only agents that logged an event in the window. The caller joins this onto its instances. */
  agents: AgentOutcomeRow[];
  corpus: CorpusDocRow[];
}

export interface AgentPanelSnapshot {
  breakdown: OutcomeBreakdown;
  recent: InteractionLogRow[];
  /** Null for a grounded agent: it writes interaction events, not sessions (A4/S15). */
  exercise: ExerciseActivity | null;
}

/** `occurred_at >= since and occurred_at < until` as one reusable fragment. */
function withinEvents(window: TimeWindow): SQL {
  return sql`${gte(interactionEvents.occurredAt, window.since)} and ${lt(interactionEvents.occurredAt, window.until)}`;
}

function withinSessions(window: TimeWindow): SQL {
  return sql`${gte(roleplaySessions.startedAt, window.since)} and ${lt(roleplaySessions.startedAt, window.until)}`;
}

/** The two windows as one contiguous range — the only rows either of them can contain. */
function unionWindow(windows: WindowPair): TimeWindow {
  return { since: windows.previous.since, until: windows.current.until };
}

const CURRENT_PREFIX = "current_";
const PREVIOUS_PREFIX = "previous_";

/**
 * Prefix a column set so both windows fit in one flat select. Drizzle takes any
 * `Record<string, SQL>`, so this keeps `breakdownCountSelect` as the single definition of what a
 * breakdown is made of instead of writing its twelve columns out twice.
 */
function prefixColumns(
  prefix: string,
  columns: Record<string, SQL<number>>,
): Record<string, SQL<number>> {
  return Object.fromEntries(
    Object.entries(columns).map(([key, value]) => [`${prefix}${key}`, value]),
  );
}

function unprefixRow(row: Record<string, unknown> | undefined, prefix: string): BreakdownRow {
  if (row === undefined) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  }
  return out as BreakdownRow;
}

/** Both windows' outcome splits from one pass over their union. */
async function loadOutcomePair(
  db: Database,
  windows: WindowPair,
): Promise<Pair<OutcomeBreakdown>> {
  const [row] = await db
    .select({
      ...prefixColumns(CURRENT_PREFIX, breakdownCountSelect(withinEvents(windows.current))),
      ...prefixColumns(PREVIOUS_PREFIX, breakdownCountSelect(withinEvents(windows.previous))),
    })
    .from(interactionEvents)
    .where(withinEvents(unionWindow(windows)));

  return {
    current: breakdownFromRow(unprefixRow(row, CURRENT_PREFIX)),
    previous: breakdownFromRow(unprefixRow(row, PREVIOUS_PREFIX)),
  };
}

function inWindow(row: BoundaryRow, window: TimeWindow): boolean {
  const at = row.occurredAt.getTime();
  return at >= window.since.getTime() && at < window.until.getTime();
}

/**
 * Both windows' conversation counts from one boundary scan.
 *
 * The rows are split first and grouped per window afterwards, which is what the two separate scans
 * did: a conversation that straddles the boundary stays two conversations, one on each side. The
 * scan cap is doubled because the range is two windows wide; `truncated` is still decided per
 * window against the single-window cap, so the note on screen means what it always meant.
 */
async function loadVolumePair(
  db: Database,
  windows: WindowPair,
): Promise<Pair<ConversationVolume>> {
  const rows = await scanBoundaryWindow(
    db,
    unionWindow(windows),
    CONVERSATION_TURN_SCAN_CAP * 2,
  );
  return {
    current: volumeFromRows(
      rows.filter((row) => inWindow(row, windows.current)),
      CONVERSATION_TURN_SCAN_CAP,
    ),
    previous: volumeFromRows(
      rows.filter((row) => inWindow(row, windows.previous)),
      CONVERSATION_TURN_SCAN_CAP,
    ),
  };
}

/** Both windows' exercise volume from one aggregate over their union. */
async function loadExercisePair(
  db: Database,
  windows: WindowPair,
): Promise<Pair<ExerciseActivity>> {
  const currentBounds = withinSessions(windows.current);
  const previousBounds = withinSessions(windows.previous);
  const [row] = await db
    .select({
      currentCount: sql<number>`count(*) filter (where ${currentBounds})`,
      currentLast: sql<Date | string | null>`max(${roleplaySessions.startedAt}) filter (where ${currentBounds})`,
      previousCount: sql<number>`count(*) filter (where ${previousBounds})`,
      previousLast: sql<Date | string | null>`max(${roleplaySessions.startedAt}) filter (where ${previousBounds})`,
    })
    .from(roleplaySessions)
    .where(withinSessions(unionWindow(windows)));

  return {
    current: {
      sessionCount: Number(row?.currentCount ?? 0),
      lastStartedAt: asDate(row?.currentLast),
    },
    previous: {
      sessionCount: Number(row?.previousCount ?? 0),
      lastStartedAt: asDate(row?.previousLast),
    },
  };
}

/**
 * Everything the Activiteit and Acties blocks need, in one fund-schema transaction: four queries
 * where the D6 loader used eight transactions.
 */
export async function getActivitySnapshot(input: {
  fundKey: string;
  windows: WindowPair;
  now?: Date;
}): Promise<ActivitySnapshot> {
  const now = input.now ?? new Date();
  return withFundSchema(input.fundKey, async (db) => {
    const outcomes = await loadOutcomePair(db, input.windows);
    const volume = await loadVolumePair(db, input.windows);
    const exercise = await loadExercisePair(db, input.windows);
    const measurementStartedAt = await loadMeasurementStartedAt(db);
    const knowledgeGaps = await loadKnowledgeGapCount(db, {
      fundKey: input.fundKey,
      since: input.windows.current.since,
      until: input.windows.current.until,
      now,
    });
    return { outcomes, volume, exercise, measurementStartedAt, knowledgeGaps };
  });
}

/**
 * Per-agent outcome splits and corpus in one transaction — one `group by agent_id` where the D6
 * loader ran two transactions per agent. `max(occurred_at)` replaces the one-row "most recent
 * interaction" read: same window, same answer, no second query per agent.
 */
export async function getAgentSnapshot(input: {
  fundKey: string;
  window: TimeWindow;
}): Promise<AgentSnapshot> {
  return withFundSchema(input.fundKey, async (db) => {
    const rows = await db
      .select({
        agentId: interactionEvents.agentId,
        lastOccurredAt: sql<Date | string | null>`max(${interactionEvents.occurredAt})`,
        ...breakdownCountSelect(),
      })
      .from(interactionEvents)
      .where(withinEvents(input.window))
      .groupBy(interactionEvents.agentId);
    const corpus = await loadCorpusOverview(db);
    return {
      agents: rows.map((row) => ({
        agentId: row.agentId,
        breakdown: breakdownFromRow(row),
        lastOccurredAt: asDate(row.lastOccurredAt),
      })),
      corpus,
    };
  });
}

/** The agent detail panel's three reads in one transaction. */
export async function getAgentPanelSnapshot(input: {
  fundKey: string;
  agentId: string;
  since: Date;
  /** True for an exercise agent: its volume lives in `roleplay_sessions`, not the event log. */
  includeExercise: boolean;
}): Promise<AgentPanelSnapshot> {
  const window = { fundKey: input.fundKey, agentId: input.agentId, since: input.since };
  return withFundSchema(input.fundKey, async (db) => {
    const breakdown = await loadOutcomeBreakdown(db, window);
    const recent = await loadRecentInteractions(db, window, 1);
    const exercise = input.includeExercise
      ? await loadExerciseActivity(db, { since: input.since })
      : null;
    return { breakdown, recent, exercise };
  });
}
