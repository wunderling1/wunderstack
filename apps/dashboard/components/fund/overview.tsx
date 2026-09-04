import {
  AgentStatusBadge,
  Card,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wunderstack/ui";
import Link from "next/link";
import { Suspense } from "react";
import {
  type OutcomeCounts,
  type Rate,
} from "@wunderstack/analytics";
import type { AgentKey } from "@wunderstack/shared";
import { ActivityCard } from "@/components/fund/activity-card";
import { MeasurementNote } from "@/components/fund/measurement-note";
import { SectionSkeleton } from "@/components/fund/panel-skeleton";
import { PeriodPicker } from "@/components/fund/period-picker";
import { UpdatedAt } from "@/components/fund/updated-at";
import { comparisonLine, formatPeriodThrough } from "@/lib/activity-copy";
import { formatCount, formatRate } from "@/lib/overview";
import { conversationListHref, outcomeChipVariant, outcomeLabel } from "@/lib/conversations";
import { PERIOD_LABELS, type PeriodId } from "@/lib/period";
import {
  loadActivityModel,
  loadAgentsModel,
  loadRecentModel,
  type OverviewActivityModel,
  type OverviewAgentsModel,
  type OverviewRecentModel,
} from "@/lib/overview-load";
import { agentLabel } from "@/lib/release-manifest";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });

export interface OverviewHrefs {
  pathname: string;
  conversations: string;
  signals: string;
  agents: string;
  agent: (agentKey: string) => string;
}

interface SectionProps {
  fundKey: string;
  period: PeriodId;
  nowMs: number;
  hrefs: OverviewHrefs;
}

/**
 * The fund overview, streamed per section.
 *
 * Chrome (period picker, timestamp) renders immediately; each block below arrives when its own
 * reads land instead of when the slowest read on the page does. The blocks share their snapshots
 * through the `cache`d loaders in `lib/overview-load.ts`, so streaming costs no extra query.
 *
 * The onboarding gate is per section rather than around the page: a page-level `await` would have
 * to resolve before any section could start its own read, which is exactly the serialisation the
 * boundaries exist to remove. Every section asks the same cached activity model, so they agree.
 *
 * The price of keeping that gate is that all four sections depend on the activity model, so they
 * land in two waves rather than four: chrome first, then everything the activity snapshot gates.
 * Dropping the gate would buy a third wave and cost the "Nog niet live" page — not a trade to make
 * for a fund with no traffic, which is exactly the fund that page is for.
 */
export function FundOverviewView(props: SectionProps) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker pathname={props.hrefs.pathname} period={props.period} />
        <div className="flex items-center gap-4">
          <UpdatedAt at={new Date(props.nowMs)} />
          <Suspense fallback={null}>
            <FundStatus {...props} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<SectionSkeleton blocks={2} />}>
        <ActivitySection {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton blocks={1} />}>
        <StatusSection {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton blocks={1} />}>
        <RecentSection {...props} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton blocks={1} />}>
        <ActionsSection {...props} />
      </Suspense>
    </div>
  );
}

async function FundStatus({ fundKey, period, nowMs }: SectionProps) {
  const model = await loadAgentsModel(fundKey, period, nowMs);
  if (model.onboarding) return null;
  return (
    <AgentStatusBadge
      status={model.fundStatus}
      label={model.fundStatus === "offline" ? "Nog niet live" : undefined}
    />
  );
}

async function ActivitySection({ fundKey, period, nowMs, hrefs }: SectionProps) {
  // Started together, not one after the other: the agents model already awaits the activity model
  // internally, so sequencing them here would add a round trip and buy nothing.
  const [model, agents] = await Promise.all([
    loadActivityModel(fundKey, period, nowMs),
    loadAgentsModel(fundKey, period, nowMs),
  ]);
  if (model.onboarding) return <OnboardingCard hrefs={hrefs} period={model.period} />;
  return <ActivityBlock model={model} agents={agents} hrefs={hrefs} nowMs={nowMs} />;
}

async function StatusSection({ fundKey, period, nowMs, hrefs }: SectionProps) {
  const model = await loadAgentsModel(fundKey, period, nowMs);
  if (model.onboarding) return null;
  return <StatusBlock model={model} hrefs={hrefs} />;
}

async function RecentSection({ fundKey, period, nowMs, hrefs }: SectionProps) {
  const model = await loadRecentModel(fundKey, period, nowMs);
  if (model.onboarding) return null;
  return <RecentBlock model={model} hrefs={hrefs} />;
}

async function ActionsSection({ fundKey, period, nowMs, hrefs }: SectionProps) {
  const model = await loadActivityModel(fundKey, period, nowMs);
  if (model.onboarding) return null;
  return <ActionsBlock model={model} hrefs={hrefs} />;
}

function OnboardingCard({ hrefs, period }: { hrefs: OverviewHrefs; period: PeriodId }) {
  return (
    <Card className="flex flex-col gap-3 p-6">
      <h2 className="font-display text-lg font-semibold text-text">Nog niet live</h2>
      <p className="text-sm text-text-muted">
        Er zijn geen vragen gesteld in de laatste {PERIOD_LABELS[period]}. Dat is geen 0% — er is
        nog niets te meten.
      </p>
      <p className="text-sm text-text">
        Volgende stap:{" "}
        <Link href={hrefs.agents} className="text-primary hover:underline">
          open de agents
        </Link>{" "}
        en controleer of ze gepubliceerd zijn.
      </p>
    </Card>
  );
}

function ActivityBlock({
  model,
  agents,
  hrefs,
  nowMs,
}: {
  model: OverviewActivityModel;
  agents: OverviewAgentsModel;
  hrefs: OverviewHrefs;
  nowMs: number;
}) {
  return (
    <section className="flex flex-col gap-4">
      <ActivityCard model={model} nowMs={nowMs} conversationsPath={hrefs.conversations} />
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
          Mix per agent
        </h3>
        {agents.agents.length === 0 ? (
          <p className="text-sm text-text-subtle">Nog geen agents op dit fonds.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                {/* One column, two units: a grounded agent answers questions, an exercise agent
                    runs sessions (S15/S22). The unit sits in the cell, not in the header. */}
                <TableHead>Volume</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.agents.map((agent) => (
                <TableRow key={agent.agentKey}>
                  <TableCell>
                    <Link
                      href={hrefs.agent(agent.agentKey)}
                      className="font-medium text-primary hover:underline"
                    >
                      {agentLabel(agent.agentKey)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={conversationListHref(hrefs.conversations, {
                        period: model.period,
                        agentId: agent.agentKey as AgentKey,
                      })}
                      className="hover:underline"
                    >
                      {formatCount(agent.total)}{" "}
                      {agent.kind === "grounded"
                        ? agent.total === 1
                          ? "vraag"
                          : "vragen"
                        : agent.total === 1
                          ? "sessie"
                          : "sessies"}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}

function StatusBlock({ model, hrefs }: { model: OverviewAgentsModel; hrefs: OverviewHrefs }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-text">Status</h2>
      <MeasurementNote startedAt={model.measurementStartedAt} />
      {model.agents.length === 0 ? (
        <p className="text-sm text-text-subtle">Nog geen agents op dit fonds.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Uitkomst</TableHead>
              <TableHead>Laatste</TableHead>
              <TableHead>Corpus</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.agents.map((agent) => (
              <TableRow key={agent.agentKey}>
                <TableCell>
                  <Link
                    href={hrefs.agent(agent.agentKey)}
                    className="font-medium text-primary hover:underline"
                  >
                    {agentLabel(agent.agentKey)}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-text-muted">
                  {agent.kind === "grounded"
                    ? outcomeLine(agent.breakdown.byOutcome, agent.breakdown.rates.answered)
                    : sessionLine(agent.total)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-text-muted">
                  {agent.lastOccurredAt ? dateTime.format(agent.lastOccurredAt) : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs text-text-muted">
                  {agent.kind === "grounded" ? agent.corpusVersion : "—"}
                </TableCell>
                <TableCell>
                  <AgentStatusBadge
                    status={agent.status}
                    label={agent.status === "offline" ? "Nog niet live" : undefined}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function RecentBlock({ model, hrefs }: { model: OverviewRecentModel; hrefs: OverviewHrefs }) {
  return (
    <section className="flex flex-col gap-3">
      {/* Scanning what is being asked right now is per question, not per conversation (S22). The
          block keeps its S11 name; the unit it shows is the question. */}
      <h2 className="text-sm font-semibold text-text">Actualiteit — laatste vragen</h2>
      {model.rows.length === 0 ? (
        <p className="text-sm text-text-subtle">Geen vragen in deze periode.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tijdstip</TableHead>
              <TableHead>Vraag</TableHead>
              <TableHead>Uitkomst</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.rows.map((row, index) => (
              <TableRow key={`${row.occurredAt.toISOString()}-${index}`}>
                <TableCell className="whitespace-nowrap text-text-muted">
                  {dateTime.format(row.occurredAt)}
                </TableCell>
                <TableCell>
                  <Link href={hrefs.conversations} className="hover:underline">
                    {row.question ?? "—"}
                  </Link>
                </TableCell>
                <TableCell>
                  <OutcomeChip outcome={row.outcome} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function ActionsBlock({ model, hrefs }: { model: OverviewActivityModel; hrefs: OverviewHrefs }) {
  const gaps = model.knowledgeGaps;
  const unit = gaps === 1 ? "onbeantwoorde vraag" : "onbeantwoorde vragen";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text">Acties</h2>
        <p className="text-sm text-text-muted">{formatPeriodThrough(model.period, new Date())}</p>
      </div>
      <MeasurementNote startedAt={model.measurementStartedAt} />
      {gaps === 0 ? (
        <p className="text-sm text-text-subtle">
          Geen onbeantwoorde vragen in deze periode. Er zijn {formatCount(model.currentQuestions)}{" "}
          vragen gesteld en {formatCount(model.current.byOutcome.answered)} beantwoord.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Link
            href={hrefs.signals}
            className="block rounded-[var(--radius-badge)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <p className="font-display text-3xl font-semibold tabular-nums text-text">
              {formatCount(gaps)}
            </p>
            <p className="mt-1 text-sm text-text-muted">{unit}</p>
          </Link>
          <p className="text-sm text-text-subtle">
            {comparisonLine(gaps, model.previousKnowledgeGaps, formatCount)}
          </p>
        </div>
      )}
    </section>
  );
}

/** Every denominator is questions (S22): "1.061 van 1.271 vragen beantwoord". */
function outcomeLine(counts: OutcomeCounts, answered: Rate): string {
  return `${formatRate(answered)} vragen beantwoord · ${formatCount(counts.refused)} geweigerd · ${formatCount(counts.clarified)} verduidelijkt`;
}

/** An exercise agent cites nothing and refuses nothing (S15): it has a session course, not an outcome. */
function sessionLine(sessionCount: number): string {
  return `${formatCount(sessionCount)} oefensessies`;
}

function OutcomeChip({ outcome }: { outcome: string }) {
  return (
    <Chip variant={outcomeChipVariant(outcome)}>{outcomeLabel(outcome)}</Chip>
  );
}
