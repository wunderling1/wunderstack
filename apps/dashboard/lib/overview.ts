import {
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

/**
 * The fund stands at the lowest of its agents (S12). Each row derived its own status in the
 * vocabulary it is measured in — turns for a grounded agent, sessions for an exercise agent — so
 * this aggregates those verdicts instead of re-deriving from turn counts an exercise agent lacks.
 */
export function fundStatusFromAgents(
  agents: Array<{ status: AgentOperationalStatus }>,
): AgentOperationalStatus {
  return deriveFundStatus(agents.map((agent) => agent.status));
}

/**
 * Label for one agent's corpus: the version of its most recently ingested document. Callers pass
 * versions newest-first (`getCorpusOverview` orders on `ingested_at desc`) — order is the meaning
 * here, so an unordered list would silently produce a different answer.
 *
 * This is the latest loaded version, not the version a release gate assessed. That second concept
 * does not exist yet (DECISION-dashboard-indeling.md, open eind 2).
 */
export function corpusVersionLabel(versions: string[]): string {
  const latest = versions.find((version) => version.length > 0);
  return latest ?? "n.n.b.";
}
