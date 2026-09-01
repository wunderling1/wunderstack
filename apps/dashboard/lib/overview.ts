import {
  deriveAgentStatus,
  deriveFundStatus,
  type AgentOperationalStatus,
  type OutcomeCounts,
  type Rate,
} from "@wunderstack/analytics";

export function totalTurns(counts: OutcomeCounts): number {
  return counts.answered + counts.refused + counts.clarified + counts.error + counts.unknown;
}

export function formatRate(rate: Rate): string {
  if ("kind" in rate) return "geen meetbare turns";
  return `${rate.numerator.toLocaleString("nl-NL")} / ${rate.denominator.toLocaleString("nl-NL")}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("nl-NL");
}

export function isOnboarding(currentTotal: number, previousTotal: number): boolean {
  return currentTotal === 0 && previousTotal === 0;
}

export function fundStatusFromAgents(
  agents: Array<{ total: number; errors: number }>,
): AgentOperationalStatus {
  return deriveFundStatus(agents.map((agent) => deriveAgentStatus(agent.total, agent.errors)));
}

export function corpusVersionLabel(versions: string[]): string {
  const latest = versions.find((version) => version.length > 0);
  return latest ?? "n.n.b.";
}
