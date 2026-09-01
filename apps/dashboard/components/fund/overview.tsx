import {
  AgentStatusBadge,
  Card,
  Chip,
  KpiTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wunderstack/ui";
import Link from "next/link";
import { SIGNAL_MIN_OCCURRENCES, type OutcomeCounts, type Rate } from "@wunderstack/analytics";
import { MeasurementNote, ScanTruncationNote } from "@/components/fund/measurement-note";
import { PeriodPicker } from "@/components/fund/period-picker";
import { formatCount, formatRate } from "@/lib/overview";
import { outcomeChipVariant, outcomeLabel } from "@/lib/conversations";
import { PERIOD_LABELS, type PeriodId } from "@/lib/period";
import type { OverviewModel } from "@/lib/overview-load";
import { agentLabel } from "@/lib/release-manifest";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });

export interface OverviewHrefs {
  pathname: string;
  conversations: string;
  signals: string;
  agents: string;
  agent: (agentKey: string) => string;
}

export function FundOverviewView({
  model,
  hrefs,
}: {
  model: OverviewModel;
  hrefs: OverviewHrefs;
}) {
  if (model.onboarding) {
    return (
      <div className="flex flex-col gap-6">
        <PeriodPicker pathname={hrefs.pathname} period={model.period} />
        <OnboardingCard hrefs={hrefs} period={model.period} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker pathname={hrefs.pathname} period={model.period} />
        <AgentStatusBadge
          status={model.fundStatus}
          label={model.fundStatus === "offline" ? "Nog niet live" : undefined}
        />
      </div>

      <ActivityBlock model={model} hrefs={hrefs} />
      <StatusBlock model={model} hrefs={hrefs} />
      <RecentBlock model={model} hrefs={hrefs} />
      <ActionsBlock model={model} hrefs={hrefs} />
    </div>
  );
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

function ActivityBlock({ model, hrefs }: { model: OverviewModel; hrefs: OverviewHrefs }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-text">Activiteit</h2>
      {/* Two units, one destination (S11a, S22): questions are what the KPIs count, conversations
          are what the list shows. Questions per conversation is the adoption signal — someone who
          asks three follow-ups is using the instrument; someone who asks once and leaves is not. */}
      <KpiTile
        label="Vragen en gesprekken"
        value={
          <Link href={hrefs.conversations} className="hover:underline">
            {formatCount(model.currentQuestions)} vragen{" "}
            <span className="text-base font-normal text-text-muted">
              in {formatCount(model.currentConversations)} gesprekken
            </span>
          </Link>
        }
        hint={
          <>
            Vorige {PERIOD_LABELS[model.period]}: {formatCount(model.previousQuestions)} vragen in{" "}
            {formatCount(model.previousConversations)} gesprekken
            {model.unthreadedQuestions > 0 ? (
              <>
                {" · "}
                {formatCount(model.unthreadedQuestions)} losse vragen, want MCP en API leveren geen
                gespreks-id
              </>
            ) : null}
          </>
        }
      />
      {model.conversationVolumeTruncated ? <ScanTruncationNote /> : null}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
          Mix per agent
        </h3>
        {model.agents.length === 0 ? (
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
                  <TableCell>
                    <Link href={hrefs.agent(agent.agentKey)} className="hover:underline">
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

function StatusBlock({ model, hrefs }: { model: OverviewModel; hrefs: OverviewHrefs }) {
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

function RecentBlock({ model, hrefs }: { model: OverviewModel; hrefs: OverviewHrefs }) {
  return (
    <section className="flex flex-col gap-3">
      {/* Scanning what is being asked right now is per question, not per conversation (S22). The
          block keeps its S11 name; the unit it shows is the question. */}
      <h2 className="text-sm font-semibold text-text">Actualiteit — laatste vragen</h2>
      {model.recent.length === 0 ? (
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
            {model.recent.map((row, index) => (
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

function ActionsBlock({ model, hrefs }: { model: OverviewModel; hrefs: OverviewHrefs }) {
  const justified = model.current.rates.refusedJustified;
  // The refused questions underneath the gaps — context for the count, never the count itself. A
  // gap is a repeated question; a single refusal is not yet one.
  const refusedQuestions = "kind" in justified ? 0 : justified.numerator;
  const gaps = model.knowledgeGaps;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-text">Acties</h2>
      <MeasurementNote startedAt={model.measurementStartedAt} />
      {gaps === 0 ? (
        <p className="text-sm text-text-subtle">
          {refusedQuestions === 0
            ? "Geen openstaande kennisgaten in deze periode."
            : `Geen kennisgaten in deze periode: geen vraag kwam ${SIGNAL_MIN_OCCURRENCES}× terug (${formatRate(justified)} vragen geweigerd zonder retrieval).`}
        </p>
      ) : (
        <p className="text-sm text-text">
          <Link href={hrefs.signals} className="text-primary hover:underline">
            {formatCount(gaps)} kennisgaten
          </Link>
          <span className="text-text-muted">
            {" "}
            (uit {formatRate(justified)} vragen geweigerd zonder retrieval)
          </span>
        </p>
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
