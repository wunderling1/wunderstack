import type { AgentContentStatus } from "@/content/agents";

/**
 * Roadmap status pill for the catalog — distinct from @wunderstack/ui's AgentStatusBadge, which is
 * about operational HEALTH (operational/degraded/offline), not "live vs. binnenkort". Honest labels:
 * "Live" only for agents with a real embedded demo.
 */
export function StatusPill({ status }: { status: AgentContentStatus }) {
  const live = status === "live";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-medium " +
        (live ? "bg-state-verified-bg text-state-verified-fg" : "bg-surface-sunk text-text-muted")
      }
    >
      <span
        className={"h-1.5 w-1.5 rounded-full " + (live ? "bg-state-verified-fg" : "bg-text-subtle")}
        aria-hidden
      />
      {live ? "Live" : "Binnenkort"}
    </span>
  );
}
