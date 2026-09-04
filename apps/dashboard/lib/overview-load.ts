import {
  deriveAgentStatus,
  emptyOutcomeBreakdown,
  getActivitySnapshot,
  getAgentSnapshot,
  getRecentInteractions,
  type AgentOperationalStatus,
  type DayCount,
  type InteractionLogRow,
  type OutcomeBreakdown,
  type PulseTick,
  type WindowPair,
} from "@wunderstack/analytics";
import { isGroundedAgentKey } from "@wunderstack/shared";
import { cache } from "react";
import { listInstancesCached } from "@/lib/fund-lookups";
import {
  corpusVersionLabel,
  fundStatusFromAgents,
  isOnboarding,
  totalQuestions,
} from "@/lib/overview";
import { currentWindow, previousWindow, type PeriodId } from "@/lib/period";

/**
 * The overview's model, split along the page's Suspense boundaries.
 *
 * Each loader is `cache`d on (fundKey, period, nowMs), so two sections that need the same snapshot
 * share one read instead of racing to issue two. That is what lets the sections stream
 * independently *and* lets the Status, Actualiteit and Acties sections honour the onboarding gate
 * without the page having to resolve it first and serialise everything behind it.
 *
 * `nowMs` is a number, not a Date, because `cache` keys on argument identity: two Dates for the
 * same instant are two cache entries. The page reads the clock once and passes it down.
 */

export function overviewWindows(period: PeriodId, nowMs: number): WindowPair {
  const current = currentWindow(period, new Date(nowMs));
  return { current, previous: previousWindow(current) };
}

/**
 * One row per agent instance, in the vocabulary of that agent. A grounded agent answers questions,
 * so it has an outcome breakdown; an exercise agent runs sessions, so it has a session count. The
 * split is here rather than in the view because the two rows come from two tables.
 */
export type OverviewAgentRow =
  | {
      kind: "grounded";
      agentKey: string;
      breakdown: OutcomeBreakdown;
      total: number;
      status: AgentOperationalStatus;
      lastOccurredAt: Date | null;
      /** This agent's own corpus. cao and arbo on one fund carry different versions. */
      corpusVersion: string;
    }
  | {
      kind: "exercise";
      agentKey: string;
      total: number;
      status: AgentOperationalStatus;
      lastOccurredAt: Date | null;
    };

/** Activiteit + Acties: the two blocks that read the fund-wide window. */
export interface OverviewActivityModel {
  period: PeriodId;
  measurementStartedAt: Date | null;
  /** Current-window breakdown — Acties prints its justified-refusal rate. */
  current: OutcomeBreakdown;
  /** Questions in the window — the KPI unit (S22). */
  currentQuestions: number;
  previousQuestions: number;
  /** Conversations those questions fall into — not including exercise sessions (S22). */
  currentConversations: number;
  /** Questions on a channel that carries no thread id (mcp, api) — named, never bundled (A6). */
  unthreadedQuestions: number;
  /** Conversation volume hit the scan cap — Activity tile counts are a floor. */
  conversationVolumeTruncated: boolean;
  onboarding: boolean;
  /** Unanswered questions in this window — same WHERE as Signalen (headline). */
  knowledgeGaps: number;
  /** Same WHERE over the previous window of equal length. */
  previousKnowledgeGaps: number;
  /** Exercise sessions in the window. Sessions carry no agent key, so this is the fund's total. */
  exerciseSessions: number;
  exerciseLastStartedAt: Date | null;
  dailySeries: DayCount[];
  pulse: PulseTick[];
  pulseTruncated: boolean;
  lastQuestionAt: Date | null;
}

export interface OverviewAgentsModel {
  agents: OverviewAgentRow[];
  fundStatus: AgentOperationalStatus;
  measurementStartedAt: Date | null;
  onboarding: boolean;
}

export interface OverviewRecentModel {
  rows: InteractionLogRow[];
  onboarding: boolean;
}

const RECENT_LIMIT = 8;

export const loadActivityModel = cache(
  async (
    fundKey: string,
    period: PeriodId,
    nowMs: number,
  ): Promise<OverviewActivityModel> => {
    const windows = overviewWindows(period, nowMs);
    const snapshot = await getActivitySnapshot({
      fundKey,
      windows,
      now: new Date(nowMs),
    });

    // Two numbers, two units (S22): questions come from the outcome breakdown, conversations from
    // the boundary grouper. Exercise sessions are sessies, not gesprekken — they belong in Mix.
    const currentQuestions = totalQuestions(snapshot.outcomes.current.byOutcome);
    const previousQuestions = totalQuestions(snapshot.outcomes.previous.byOutcome);
    const currentConversations = snapshot.volume.current.conversations;
    const currentActivity = currentQuestions + snapshot.exercise.current.sessionCount;
    const previousActivity = previousQuestions + snapshot.exercise.previous.sessionCount;

    return {
      period,
      measurementStartedAt: snapshot.measurementStartedAt,
      current: snapshot.outcomes.current,
      currentQuestions,
      previousQuestions,
      currentConversations,
      unthreadedQuestions: snapshot.volume.current.unthreadedQuestions,
      conversationVolumeTruncated: snapshot.volume.current.truncated,
      onboarding: isOnboarding(currentActivity, previousActivity),
      knowledgeGaps: snapshot.knowledgeGaps,
      previousKnowledgeGaps: snapshot.previousKnowledgeGaps,
      exerciseSessions: snapshot.exercise.current.sessionCount,
      exerciseLastStartedAt: snapshot.exercise.current.lastStartedAt,
      dailySeries: snapshot.dailySeries,
      pulse: snapshot.pulse.ticks,
      pulseTruncated: snapshot.pulse.truncated,
      lastQuestionAt: snapshot.lastQuestionAt,
    };
  },
);

export const loadAgentsModel = cache(
  async (fundKey: string, period: PeriodId, nowMs: number): Promise<OverviewAgentsModel> => {
    const windows = overviewWindows(period, nowMs);
    // The exercise volume lives in the activity snapshot; `cache` means asking for it here costs
    // nothing when the Activiteit section already did. All three start together.
    const [instances, snapshot, activity] = await Promise.all([
      listInstancesCached(fundKey),
      getAgentSnapshot({ fundKey, window: windows.current }),
      loadActivityModel(fundKey, period, nowMs),
    ]);

    const byAgent = new Map(snapshot.agents.map((row) => [row.agentKey, row]));

    const agents: OverviewAgentRow[] = instances.map((instance): OverviewAgentRow => {
      if (!isGroundedAgentKey(instance.agentKey)) {
        // Sessions carry no agent key: this is the fund's exercise volume. With more than one
        // exercise instance on a fund it would need one, and this read has to narrow.
        return {
          kind: "exercise",
          agentKey: instance.agentKey,
          total: activity.exerciseSessions,
          // No error concept on a session: an abandoned run is a signal, not a failure of the agent.
          status: deriveAgentStatus(activity.exerciseSessions, 0),
          lastOccurredAt: activity.exerciseLastStartedAt,
        };
      }
      // An instance with no rows in the window is not missing from the table — it is offline.
      const row = byAgent.get(instance.agentKey);
      const breakdown = row?.breakdown ?? emptyOutcomeBreakdown();
      const total = totalQuestions(breakdown.byOutcome);
      return {
        kind: "grounded",
        agentKey: instance.agentKey,
        breakdown,
        total,
        status: deriveAgentStatus(total, breakdown.byOutcome.error),
        lastOccurredAt: row?.lastOccurredAt ?? null,
        corpusVersion: corpusVersionLabel(
          snapshot.corpus
            .filter((doc) => doc.agentKey === instance.agentKey)
            .map((doc) => doc.version),
        ),
      };
    });

    return {
      agents,
      fundStatus: fundStatusFromAgents(agents),
      measurementStartedAt: activity.measurementStartedAt,
      onboarding: activity.onboarding,
    };
  },
);

export const loadRecentModel = cache(
  async (fundKey: string, period: PeriodId, nowMs: number): Promise<OverviewRecentModel> => {
    const windows = overviewWindows(period, nowMs);
    const [rows, activity] = await Promise.all([
      getRecentInteractions({ fundKey, since: windows.current.since }, RECENT_LIMIT),
      loadActivityModel(fundKey, period, nowMs),
    ]);
    return { rows, onboarding: activity.onboarding };
  },
);
