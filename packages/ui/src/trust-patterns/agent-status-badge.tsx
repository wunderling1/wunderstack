import { cn } from "../lib/cn.js";

export type AgentStatus = "operational" | "degraded" | "offline";

export interface AgentStatusBadgeProps {
  status: AgentStatus;
  /** Overrides the default status label (user-facing, NL). */
  label?: string;
  className?: string;
}

const STATUS: Record<AgentStatus, { label: string; dot: string; fg: string; bg: string }> = {
  operational: {
    label: "Operationeel",
    dot: "bg-state-verified-fg",
    fg: "text-state-verified-fg",
    bg: "bg-state-verified-bg",
  },
  degraded: {
    label: "Beperkt",
    dot: "bg-state-caution-fg",
    fg: "text-state-caution-fg",
    bg: "bg-state-caution-bg",
  },
  offline: {
    label: "Offline",
    dot: "bg-state-danger-fg",
    fg: "text-state-danger-fg",
    bg: "bg-state-danger-bg",
  },
};

/**
 * Trust-pattern: an agent's honest operational status. Red stays red — the badge never dresses up a
 * failing gate as healthy (PLAN-ui-ecosystem §1).
 */
export function AgentStatusBadge({ status, label, className }: AgentStatusBadgeProps) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-medium",
        s.bg,
        s.fg,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
      {label ?? s.label}
    </span>
  );
}
