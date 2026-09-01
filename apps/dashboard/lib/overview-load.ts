import {
  deriveAgentStatus,
  getCorpusOverview,
  getOutcomeBreakdown,
  getRecentInteractions,
  measurementStartedAt,
  type AgentOperationalStatus,
  type InteractionLogRow,
  type OutcomeBreakdown,
} from "@wunderstack/analytics";
import { listInstancesCached } from "@/lib/fund-lookups";
import {
  corpusVersionLabel,
  fundStatusFromAgents,
  isOnboarding,
  totalTurns,
} from "@/lib/overview";
import { currentWindow, previousWindow, type PeriodId } from "@/lib/period";

export interface OverviewAgentRow {
  agentKey: string;
  breakdown: OutcomeBreakdown;
  total: number;
  status: AgentOperationalStatus;
  lastOccurredAt: Date | null;
}

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

  const [currentBreakdown, previousBreakdown, startedAt, instances, corpus, recent] =
    await Promise.all([
      getOutcomeBreakdown({ fundKey, ...window }),
      getOutcomeBreakdown({ fundKey, ...prevWindow }),
      measurementStartedAt(fundKey),
      listInstancesCached(fundKey),
      getCorpusOverview(fundKey),
      getRecentInteractions({ fundKey, since: current.since }, 8),
    ]);

  const agents: OverviewAgentRow[] = await Promise.all(
    instances.map(async (instance) => {
      const [breakdown, last] = await Promise.all([
        getOutcomeBreakdown({ fundKey, agentId: instance.agentKey, ...window }),
        getRecentInteractions({ fundKey, agentId: instance.agentKey, since: current.since }, 1),
      ]);
      const total = totalTurns(breakdown.byOutcome);
      return {
        agentKey: instance.agentKey,
        breakdown,
        total,
        status: deriveAgentStatus(total, breakdown.byOutcome.error),
        lastOccurredAt: last[0]?.occurredAt ?? null,
      };
    }),
  );

  const currentTotal = totalTurns(currentBreakdown.byOutcome);
  const previousTotal = totalTurns(previousBreakdown.byOutcome);

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
    fundStatus: fundStatusFromAgents(agents.map((agent) => ({ total: agent.total, errors: agent.breakdown.byOutcome.error }))),
    corpusVersion: corpusVersionLabel(corpus.map((doc) => doc.version)),
    agents,
    recent,
  };
}
