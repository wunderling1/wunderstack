import { Card } from "@wunderstack/ui";
import Link from "next/link";
import type { OverviewActivityModel } from "@/lib/overview-load";
import { formatCount } from "@/lib/overview";
import {
  activityConversationsHref,
  comparisonLine,
  formatPeriodThrough,
} from "@/lib/activity-copy";
import { ActivityPulse } from "./activity-pulse";
import { ActivitySparkline } from "./activity-sparkline";

export function ActivityCard({
  model,
  nowMs,
  conversationsPath,
}: {
  model: OverviewActivityModel;
  nowMs: number;
  conversationsPath: string;
}) {
  const now = new Date(nowMs);
  const questionsHref = activityConversationsHref(conversationsPath, model.period);
  const pulseHref = activityConversationsHref(conversationsPath, model.period, true);
  const unit = model.currentQuestions === 1 ? "vraag gesteld" : "vragen gesteld";
  const conversationUnit = model.currentConversations === 1 ? "gesprek" : "gesprekken";

  return (
    <Card variant="flush" className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
        <h2 className="text-sm font-semibold text-text">Activiteit</h2>
        <p className="text-sm text-text-muted">{formatPeriodThrough(model.period, now)}</p>
      </div>

      <div className="flex flex-col gap-6 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {/* S11a / S22: questions are the KPI; conversations follow that same destination. */}
          <Link
            href={questionsHref}
            className="block rounded-[var(--radius-badge)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <p className="font-display text-3xl font-semibold tabular-nums text-text">
              {formatCount(model.currentQuestions)}
            </p>
            <p className="mt-1 text-sm text-text-muted">{unit}</p>
            <p className="text-sm text-text-muted">
              in {formatCount(model.currentConversations)} {conversationUnit}
            </p>
          </Link>
          <p className="mt-2 text-sm text-text-subtle">
            {comparisonLine(model.currentQuestions, model.previousQuestions, formatCount)}
          </p>
          {model.unthreadedQuestions > 0 ? (
            <p className="mt-1 text-xs text-text-subtle">
              {formatCount(model.unthreadedQuestions)} losse vragen — MCP en API leveren geen
              gesprek-id
            </p>
          ) : null}
          {model.conversationVolumeTruncated ? (
            <p className="mt-1 text-xs text-text-subtle">
              Telling gesprekken is een ondergrens: het venster raakte de scanlimiet
            </p>
          ) : null}
        </div>
        <div className="w-full shrink-0 sm:w-56 md:w-72">
          <ActivitySparkline series={model.dailySeries} />
        </div>
      </div>

      <div className="border-t border-border px-5 py-3">
        <ActivityPulse
          ticks={model.pulse}
          truncated={model.pulseTruncated}
          lastQuestionAt={model.lastQuestionAt}
          now={now}
          href={pulseHref}
        />
      </div>
    </Card>
  );
}
