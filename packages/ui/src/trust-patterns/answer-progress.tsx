import { cn } from "../lib/cn.js";
import type { DensitySize } from "./answer-card.js";

export interface AnswerProgressStep {
  /** Stable key for the step (e.g. "searching"). */
  id: string;
  /** User-facing label (NL). */
  label: string;
}

export interface AnswerProgressProps {
  /** Ordered checklist steps. Roleplay passes a single step. */
  steps: AnswerProgressStep[];
  /**
   * Id of the currently active step. Steps before it are "done"; steps after are "pending".
   * When omitted, the first step is active (optimistic "searching").
   */
  activeId?: string | null;
  /** Density (D18). */
  size?: DensitySize;
  className?: string;
}

/**
 * Trust-pattern: wait-UI for a grounded answer. Neutral circle markers (inline SVG — no Lucide)
 * so the embed panel stays Lucide-free. Done = verified green check; active = spinning primary;
 * pending = muted.
 */
export function AnswerProgress({
  steps,
  activeId = null,
  size = "md",
  className,
}: AnswerProgressProps) {
  if (steps.length === 0) return null;

  const activeIndex = (() => {
    if (activeId === null || activeId === undefined) return 0;
    const i = steps.findIndex((s) => s.id === activeId);
    return i === -1 ? 0 : i;
  })();

  const compact = size === "sm";

  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-5", className)} role="status">
      {steps.map((step, index) => {
        const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
        return (
          <div key={step.id} className="flex items-center gap-3">
            <span
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full",
                compact ? "h-6 w-6" : "h-7 w-7",
                state === "done" && "bg-state-verified-bg",
                state === "active" && "bg-primary-tint",
                state === "pending" && "bg-surface-sunk",
              )}
              {...(state === "active" ? { "aria-live": "polite" as const } : {})}
            >
              {state === "done" ? (
                <CheckIcon className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "text-state-verified-fg")} />
              ) : state === "active" ? (
                <SpinnerIcon
                  className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "motion-spin text-primary")}
                />
              ) : (
                <DotIcon className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "text-text-subtle")} />
              )}
            </span>
            <p
              className={cn(
                compact ? "text-sm" : "text-base",
                state === "pending" ? "text-text-subtle" : "text-text",
              )}
            >
              {step.label}
              {state === "active" ? "…" : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M8 2.5a5.5 5.5 0 1 1-3.89 1.61" strokeLinecap="round" />
    </svg>
  );
}

function DotIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className={className}>
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}
