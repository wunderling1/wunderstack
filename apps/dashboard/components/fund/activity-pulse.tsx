import { PULSE_TICK_CAP, PULSE_WINDOW_MS, type PulseTick } from "@wunderstack/analytics";
import Link from "next/link";
import { formatCount } from "@/lib/overview";
import { formatRelativeToNow } from "@/lib/activity-copy";

const TICK_CLASS: Record<PulseTick["outcome"], string> = {
  answered: "bg-text-muted",
  unknown: "bg-text-subtle",
  refused: "bg-state-caution-fg",
  error: "bg-state-danger-fg",
  clarified: "bg-primary",
};

/**
 * Last 60 minutes, left = an hour ago, right = now. Each tick is one question.
 * The whole rule is one destination (S11a): today's conversations.
 */
export function ActivityPulse({
  ticks,
  truncated = false,
  lastQuestionAt,
  now,
  href,
}: {
  ticks: readonly PulseTick[];
  /** True when the hour held more than {@link PULSE_TICK_CAP} questions. */
  truncated?: boolean;
  lastQuestionAt: Date | null;
  now: Date;
  href: string;
}) {
  const live = ticks.length > 0;
  const start = now.getTime() - PULSE_WINDOW_MS;
  const countLabel = truncated
    ? `${formatCount(PULSE_TICK_CAP)}+ in het laatste uur`
    : `${formatCount(ticks.length)} in het laatste uur`;

  return (
    <Link
      href={href}
      className="flex flex-wrap items-center gap-3 rounded-[var(--radius-badge)] text-sm text-text hover:bg-surface-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span
          className={
            live
              ? "h-2 w-2 rounded-full bg-state-verified-fg"
              : "h-2 w-2 rounded-full bg-text-subtle"
          }
          aria-hidden
        />
        <span className={live ? "text-text" : "text-text-muted"}>
          {live ? "Nu actief" : "Geen vragen in het laatste uur"}
        </span>
      </span>
      <span
        className="relative h-5 min-w-40 flex-1 rounded-sm bg-surface-sunk"
        aria-hidden
      >
        {ticks.map((tick, index) => {
          const left = ((tick.occurredAt.getTime() - start) / PULSE_WINDOW_MS) * 100;
          const clamped = Math.min(100, Math.max(0, left));
          return (
            <span
              key={`${tick.occurredAt.toISOString()}-${index}`}
              className={`absolute top-0.5 h-4 w-0.5 rounded-sm ${TICK_CLASS[tick.outcome]}`}
              style={{ left: `${clamped}%` }}
            />
          );
        })}
      </span>
      <span className="whitespace-nowrap text-text-muted">
        {live
          ? countLabel
          : lastQuestionAt
            ? `laatste vraag ${formatRelativeToNow(lastQuestionAt, now)}`
            : null}
      </span>
    </Link>
  );
}
