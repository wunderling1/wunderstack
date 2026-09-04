import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Card } from "../primitives/card";

export interface KpiTileProps {
  /** What the number measures (e.g. "Beantwoord met geverifieerde citaties"). */
  label: string;
  /** The headline value. */
  value: ReactNode;
  /** Optional supporting note under the value (period, caveat, delta). */
  hint?: ReactNode;
  className?: string;
}

/**
 * Trust-pattern: a single KPI on the fund dashboard. Copy stays honest to what the metric measures
 * (PLAN-ui-ecosystem, Fase 3 KPI-noot) — the label describes the metric, the tile never inflates it.
 */
export function KpiTile({ label, value, hint, className }: KpiTileProps) {
  return (
    <Card className={cn("flex flex-col gap-1 p-4", className)}>
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className="font-display text-2xl font-semibold text-text">{value}</span>
      {hint !== undefined ? <span className="text-xs text-text-subtle">{hint}</span> : null}
    </Card>
  );
}
