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
import type { OutcomeCounts, Rate } from "@wunderstack/analytics";
import { MeasurementNote } from "@/components/fund/measurement-note";
import { PeriodPicker } from "@/components/fund/period-picker";
import { formatCount, formatRate } from "@/lib/overview";
import { PERIOD_LABELS, type PeriodId } from "@/lib/period";
import type { OverviewModel } from "@/lib/overview-load";
import { agentLabel } from "@/lib/release-manifest";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });

export interface OverviewHrefs {
  pathname: string;
  gesprekken: string;
  signalen: string;
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
        Er zijn geen gesprekken in de laatste {PERIOD_LABELS[period]}. Dat is geen 0% — er is nog
        niets te meten.
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
      <KpiTile
        label="Gesprekken"
        value={
          <Link href={hrefs.gesprekken} className="hover:underline">
            {formatCount(model.currentTotal)}
          </Link>
        }
        hint={`Vorige ${PERIOD_LABELS[model.period]}: ${formatCount(model.previousTotal)}`}
      />
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
                <TableHead>Gesprekken</TableHead>
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
                      {formatCount(agent.total)}
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
                  {agent.kind === "grounded" ? model.corpusVersion : "—"}
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
      <h2 className="text-sm font-semibold text-text">Actualiteit</h2>
      {model.recent.length === 0 ? (
        <p className="text-sm text-text-subtle">Geen gesprekken in deze periode.</p>
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
                  <Link href={hrefs.gesprekken} className="hover:underline">
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
  const count = "kind" in justified ? 0 : justified.numerator;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-text">Acties</h2>
      <MeasurementNote startedAt={model.measurementStartedAt} />
      {count === 0 ? (
        <p className="text-sm text-text-subtle">Geen openstaande kennisgaten in deze periode.</p>
      ) : (
        <p className="text-sm text-text">
          <Link href={hrefs.signalen} className="text-primary hover:underline">
            {formatCount(count)} kennisgaten
          </Link>
          <span className="text-text-muted"> ({formatRate(justified)} geweigerd zonder retrieval)</span>
        </p>
      )}
    </section>
  );
}

function outcomeLine(counts: OutcomeCounts, answered: Rate): string {
  return `${formatRate(answered)} beantwoord · ${formatCount(counts.refused)} geweigerd · ${formatCount(counts.clarified)} verduidelijkt`;
}

/** An exercise agent cites nothing and refuses nothing (S15): it has a session course, not an outcome. */
function sessionLine(sessionCount: number): string {
  return `${formatCount(sessionCount)} oefensessies`;
}

function OutcomeChip({ outcome }: { outcome: string }) {
  const variant =
    outcome === "answered"
      ? "verified"
      : outcome === "clarified"
        ? "caution"
        : outcome === "error"
          ? "danger"
          : outcome === "unknown"
            ? "caution"
            : "refusal";
  const label =
    outcome === "answered"
      ? "Beantwoord"
      : outcome === "clarified"
        ? "Verduidelijkt"
        : outcome === "error"
          ? "Fout"
          : outcome === "unknown"
            ? "Onbekend"
            : "Geweigerd";
  return <Chip variant={variant}>{label}</Chip>;
}
