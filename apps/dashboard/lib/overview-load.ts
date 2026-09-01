import {
  deriveAgentStatus,
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
  totalTurns,
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
  currentTotal: number;
  previousTotal: number;
  onboarding: boolean;
  fundStatus: AgentOperationalStatus;
  corpusVersion: string;
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
      const total = totalTurns(breakdown.byOutcome);
      return {
        kind: "grounded",
        agentKey: instance.agentKey,
        breakdown,
        total,
        status: deriveAgentStatus(total, breakdown.byOutcome.error),
        lastOccurredAt: last[0]?.occurredAt ?? null,
      };
    }),
  );

  // Volume is what Gesprekken lists: grounded turns plus exercise sessions. Added here rather than
  // read from one table, so the tile and the list it links to cannot drift apart.
  const currentTotal = totalTurns(currentBreakdown.byOutcome) + exercise.sessionCount;
  const previousTotal = totalTurns(previousBreakdown.byOutcome) + previousExercise.sessionCount;

  return {
    period,
    since: current.since,
    until: current.until,
    previousSince: previous.since,
    previousUntil: previous.until,
    measurementStartedAt: startedAt,
    current: currentBreakdown,
    previous: previousBreakdown,
    currentTotal,
    previousTotal,
    onboarding: isOnboarding(currentTotal, previousTotal),
    fundStatus: fundStatusFromAgents(agents),
    corpusVersion: corpusVersionLabel(corpus.map((doc) => doc.version)),
    agents,
    recent,
  };
}
