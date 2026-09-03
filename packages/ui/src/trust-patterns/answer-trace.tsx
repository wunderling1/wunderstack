import { cn } from "../lib/cn";
import type { AnswerTraceStep, AnswerTraceTone } from "../lib/answer-trace";
import type { DensitySize } from "./answer-card";

export interface AnswerTraceProps {
  /** Head line, e.g. "Zoeken in de CAO". Carries the sheen while work is in flight. */
  head: string;
  /** What the runtime has reported so far, already paced (see `usePacedTrace`). */
  steps: AnswerTraceStep[];
  /** True while the turn is still running: the newest step is the one in progress. */
  inFlight: boolean;
  /**
   * One-line summary of a finished turn. Present means the work is over: the head line gives way
   * to a collapsed disclosure, and the steps move behind it. Absent means no measured outcome —
   * do not invent one (B5).
   */
  summary?: string | null;
  /** Density (D18). */
  size?: DensitySize;
  className?: string;
}

/** Tone → the dot colour, straight onto the semantic state tokens. */
const TONE_DOT: Record<AnswerTraceTone, string> = {
  refusal: "bg-state-refusal-fg",
  danger: "bg-state-danger-fg",
};

/**
 * Trust-pattern: the wait is a log of what the runtime did, not a spinner. Each step is a measured
 * event; chips are the passages retrieval considered, struck through once the threshold check
 * lands. When the turn ends, the same log collapses into a grey summary line above the answer
 * card — still reachable, no longer in the way.
 *
 * Motion (B6 / A2): the sheen is on the head; the writing step gets three dots. Nothing else
 * animates. The rhythm comes from the progress queue, not from CSS. Inline SVG keeps the embed
 * Lucide-free.
 */
export function AnswerTrace({
  head,
  steps,
  inFlight,
  summary = null,
  size = "md",
  className,
}: AnswerTraceProps) {
  const compact = size === "sm";

  if (summary !== null && summary.length > 0) {
    /*
     * Native `<details>` rather than a button plus state: it keeps this component free of client
     * state (the embed and the playground both render it inside their own trees) and hands the
     * expanded/collapsed semantics to the platform. No border, no background, no outcome dot —
     * just a grey line with a chevron that rotates a quarter turn (A2).
     */
    return (
      <details className={cn("group", className)}>
        <summary
          className={cn(
            "inline-flex cursor-pointer list-none items-center gap-1.5 text-text-muted",
            "[&::-webkit-details-marker]:hidden hover:text-text",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            compact ? "text-xs" : "text-sm",
          )}
        >
          <span>{summary}</span>
          <CaretIcon
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-text-subtle group-open:rotate-90",
              "[transition:transform_var(--motion-state)]",
            )}
          />
        </summary>
        <TraceSteps steps={steps} inFlight={false} compact={compact} className="pt-2" />
      </details>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        className={cn("flex items-center gap-2 font-medium", compact ? "text-xs" : "text-sm")}
        aria-live="polite"
      >
        <GlassIcon className={cn("shrink-0 text-text-subtle", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
        <span className={inFlight ? "motion-sheen" : "text-text-muted"}>{head}</span>
      </div>
      <TraceSteps steps={steps} inFlight={inFlight} compact={compact} className="mt-1" />
    </div>
  );
}

function TraceSteps({
  steps,
  inFlight,
  compact,
  className,
}: {
  steps: AnswerTraceStep[];
  inFlight: boolean;
  compact: boolean;
  className?: string;
}) {
  if (steps.length === 0) {
    return null;
  }

  return (
    /*
     * One continuous hairline with the markers pinned onto it, not a stack of segments: the steps
     * of a single turn are one thread. The pixel offsets align an odd-sized dot on a 1px border,
     * which no spacing token can express — they are geometry, not design values.
     *
     * aria-live="off": a screen reader must not announce every chip as it lands; the head line
     * already carries the polite live region for the turn as a whole.
     */
    <ol className={cn("ml-2 border-l border-border pt-1.5 pl-[22px]", className)} aria-live="off">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const active = inFlight && isLast;
        const showDots = inFlight && step.pending;
        return (
          <li key={step.id} className={cn("relative", isLast ? "pb-0.5" : "pb-4")}>
            {/*
             * While work is in flight the newest step is the one in progress, so "here we are" wins
             * over its verdict; once the turn is over every step shows the tone it earned. A step
             * without a tone stays neutral: "9 passages gecontroleerd" is a fact, not a good outcome.
             */}
            <span
              className={cn(
                "absolute top-[6px] -left-[26px] h-[7px] w-[7px] rounded-full",
                active
                  ? "bg-primary ring-[3px] ring-primary-tint"
                  : step.tone === null
                    ? "bg-text-subtle"
                    : TONE_DOT[step.tone],
              )}
            />
            <p className={cn("font-medium text-text", compact ? "text-xs" : "text-sm")}>
              {step.label}
              {showDots ? <WritingDots /> : null}
            </p>
            {step.detail === null ? null : (
              <p className={cn("text-text-muted", compact ? "text-xs" : "text-sm")}>
                {step.detail}
              </p>
            )}
            {step.chips.length > 0 || step.overflowLabel !== null ? (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {step.chips.map((chip) => (
                  <span
                    key={chip.id}
                    className={cn(
                      "inline-flex items-center rounded-[var(--radius-badge)] bg-surface-sunk px-2.5 py-1.5 text-xs leading-none",
                      chip.struck ? "text-text-subtle line-through" : "text-text-muted",
                    )}
                  >
                    {chip.label}
                  </span>
                ))}
                {step.overflowLabel === null ? null : (
                  <span className="inline-flex items-center px-1 py-1.5 text-xs leading-none text-text-subtle">
                    {step.overflowLabel}
                  </span>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function WritingDots() {
  return (
    <span className="ml-0.5 inline-flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="motion-dots inline-block h-[3px] w-[3px] rounded-full bg-text-muted"
          style={{ ["--i" as string]: i }}
        />
      ))}
    </span>
  );
}

function GlassIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2 14 14" strokeLinecap="round" />
    </svg>
  );
}

function CaretIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
