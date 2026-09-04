import {
  deriveAgentStatus,
  type AgentOperationalStatus,
  type OutcomeCounts,
  type Rate,
} from "@wunderstack/analytics";
import { formatRate, fundStatusFromAgents, totalQuestions } from "@/lib/overview";

export function statusFromCounts(counts: OutcomeCounts): AgentOperationalStatus {
  return deriveAgentStatus(totalQuestions(counts), counts.error);
}

export function answerRateDisplay(rate: Rate, total: number): string {
  if (total === 0) return "—";
  return formatRate(rate);
}

/**
 * Fund status = worst agent among configured instances and agents that logged events.
 * Instances with no events count as offline; events without an instance still count
 * (a live fund must not read as "nog niet live" because provisioning skipped instances).
 */
export function fundStatusFromInstancesAndActivity(
  instanceKeys: string[],
  activity: Array<{ agentKey: string; byOutcome: OutcomeCounts }>,
): AgentOperationalStatus {
  const byAgent = new Map<string, AgentOperationalStatus>();
  for (const key of instanceKeys) {
    byAgent.set(key, deriveAgentStatus(0, 0));
  }
  for (const row of activity) {
    byAgent.set(row.agentKey, statusFromCounts(row.byOutcome));
  }
  return fundStatusFromAgents([...byAgent.values()].map((status) => ({ status })));
}

export function fundStatusLabel(status: AgentOperationalStatus): string {
  if (status === "offline") return "Nog niet live";
  if (status === "degraded") return "Beperkt";
  return "Actief";
}
