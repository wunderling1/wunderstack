import {
  countKnowledgeGaps,
  deriveAgentStatus,
  getConversationVolume,
  getCorpusOverview,
  getExerciseActivity,
  getOutcomeBreakdown,
  getRecentInteractions,
  measurementStartedAt,
  type AgentOperationalStatus,
  type InteractionLogRow,
  type OutcomeBreakdown,
} from "@wunderstack/analytics";
import { isGroundedAgentKey } from "@wunderstack/shared";
import { listInstancesCached } from "@/lib/fund-lookups";
import {
  corpusVersionLabel,
  fundStatusFromAgents,
  isOnboarding,
  totalQuestions,
} from "@/lib/overview";
import { currentWindow, previousWindow, type PeriodId } from "@/lib/period";

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

export interface OverviewModel {
  period: PeriodId;
  since: Date;
  until: Date;
  previousSince: Date;
  previousUntil: Date;
  measurementStartedAt: Date | null;
  current: OutcomeBreakdown;
  previous: OutcomeBreakdown;
  /** Questions in the window — the KPI unit (S22). */
  currentQuestions: number;
  previousQuestions: number;
  /** Conversations those questions fall into, plus exercise sessions: both are containers (S22). */
  currentConversations: number;
  previousConversations: number;
  /** Questions on a channel that carries no thread id (mcp, api) — named, never bundled (A6). */
  unthreadedQuestions: number;
  onboarding: boolean;
  fundStatus: AgentOperationalStatus;
  /** Groups the Signalen list holds for this window — what "N kennisgaten" counts (S11a). */
  knowledgeGaps: number;
  /** Conversation volume hit the scan cap — Activity tile counts are a floor. */
  conversationVolumeTruncated: boolean;
  agents: OverviewAgentRow[];
  recent: InteractionLogRow[];
}

export async function loadOverviewModel(
  fundKey: string,
  period: PeriodId,
  now = new Date(),
): Promise<OverviewModel> {
  const current = currentWindow(period, now);
  const previous = previousWindow(current);
  const window = { since: current.since, until: current.until };
  const prevWindow = { since: previous.since, until: previous.until };

  const [
    currentBreakdown,
    previousBreakdown,
    startedAt,
    instances,
    corpus,
    recent,
    exercise,
    previousExercise,
    knowledgeGaps,
    volume,
    previousVolume,
  ] = await Promise.all([
    getOutcomeBreakdown({ fundKey, ...window }),
    getOutcomeBreakdown({ fundKey, ...prevWindow }),
    measurementStartedAt(fundKey),
    listInstancesCached(fundKey),
    getCorpusOverview(fundKey),
    getRecentInteractions({ fundKey, since: current.since }, 8),
    // Sessions carry no agent key: this is the fund's exercise volume. With more than one exercise
    // instance on a fund it would need one, and this read has to narrow.
    getExerciseActivity({ fundKey, ...window }),
    getExerciseActivity({ fundKey, ...prevWindow }),
    // Counted here, not derived from the refusal rate: Acties must print what Signalen lists.
    countKnowledgeGaps({ fundKey, ...window, now }),
    getConversationVolume({ fundKey, ...window }),
    getConversationVolume({ fundKey, ...prevWindow }),
  ]);

  const agents: OverviewAgentRow[] = await Promise.all(
    instances.map(async (instance): Promise<OverviewAgentRow> => {
      if (!isGroundedAgentKey(instance.agentKey)) {
        return {
          kind: "exercise",
          agentKey: instance.agentKey,
          total: exercise.sessionCount,
          // No error concept on a session: an abandoned run is a signal, not a failure of the agent.
          status: deriveAgentStatus(exercise.sessionCount, 0),
          lastOccurredAt: exercise.lastStartedAt,
        };
      }
      const [breakdown, last] = await Promise.all([
        getOutcomeBreakdown({ fundKey, agentId: instance.agentKey, ...window }),
        getRecentInteractions({ fundKey, agentId: instance.agentKey, since: current.since }, 1),
      ]);
      const total = totalQuestions(breakdown.byOutcome);
      return {
        kind: "grounded",
        agentKey: instance.agentKey,
        breakdown,
        total,
        status: deriveAgentStatus(total, breakdown.byOutcome.error),
        lastOccurredAt: last[0]?.occurredAt ?? null,
        corpusVersion: corpusVersionLabel(
          corpus.filter((doc) => doc.agentKey === instance.agentKey).map((doc) => doc.version),
        ),
      };
    }),
  );

  // Two numbers, two units (S22): questions come from the outcome breakdown, conversations from the
  // boundary grouper. An exercise session is a container too, so it counts as a conversation and
  // contributes no questions — that is why the tile reads "N vragen in M gesprekken" and not a sum.
  const currentQuestions = totalQuestions(currentBreakdown.byOutcome);
  const previousQuestions = totalQuestions(previousBreakdown.byOutcome);
  const currentConversations = volume.conversations + exercise.sessionCount;
  const previousConversations = previousVolume.conversations + previousExercise.sessionCount;

  return {
    period,
    since: current.since,
    until: current.until,
    previousSince: previous.since,
    previousUntil: previous.until,
    measurementStartedAt: startedAt,
    current: currentBreakdown,
    previous: previousBreakdown,
    currentQuestions,
    previousQuestions,
    currentConversations,
    previousConversations,
    unthreadedQuestions: volume.unthreadedQuestions,
    onboarding: isOnboarding(currentConversations, previousConversations),
    fundStatus: fundStatusFromAgents(agents),
    knowledgeGaps,
    conversationVolumeTruncated: volume.truncated,
    agents,
    recent,
  };
}
