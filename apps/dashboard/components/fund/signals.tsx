import { Button, Card, Select } from "@wunderstack/ui";
import Link from "next/link";
import {
  SIGNAL_MIN_OCCURRENCES,
  type ExerciseAdoptionRow,
  type QuestionSignal,
} from "@wunderstack/analytics";
import { MeasurementNote } from "@/components/fund/measurement-note";
import { PeriodPicker } from "@/components/fund/period-picker";
import { UpdatedAt } from "@/components/fund/updated-at";
import { conversationPermalink } from "@/lib/conversations";
import { formatCount } from "@/lib/overview";
import { agentLabel } from "@/lib/release-manifest";
import { signalsFilterExtras, type SignalsFilters } from "@/lib/signals";
import type { SignalsModel } from "@/lib/signals-load";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });

export function SignalsView({
  pathname,
  conversationsPath,
  model,
  showSuspicious,
  readAt,
}: {
  pathname: string;
  conversationsPath: string;
  model: SignalsModel;
  showSuspicious: boolean;
  /** When these signals were read — the Client Router Cache can hand back a page up to 30s old. */
  readAt: Date;
}) {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-text">Signalen</h2>
          <p className="mt-1 text-sm text-text-muted">
            Letterlijke vragen en oefenscenario&apos;s — geen gegenereerde thema&apos;s of
            samenvattingen. Een groep verschijnt pas bij {SIGNAL_MIN_OCCURRENCES} identieke vragen
            in deze selectie.
          </p>
        </div>
        <UpdatedAt at={readAt} />
      </div>

      <SignalsFiltersForm pathname={pathname} filters={model.filters} agents={model.agents} />

      <MeasurementNote startedAt={model.measurementStartedAt} />

      <QuestionList
        title="Kennisgaten"
        description="Geweigerd zonder retrieval. De backlog van onbeantwoorde vragen."
        empty="Geen kennisgaten die de drempel halen in deze selectie."
        rows={model.knowledgeGaps}
        total={model.knowledgeGapsTotal}
        conversationsPath={conversationsPath}
      />

      {showSuspicious ? (
        <QuestionList
          title="Verdachte weigeringen"
          description="Intern: geweigerd terwijl retrieval sterk was. Werk voor ons, niet voor het fonds."
          empty="Geen verdachte weigeringen die de drempel halen in deze selectie."
          rows={model.suspiciousRefusals}
          conversationsPath={conversationsPath}
        />
      ) : null}

      <AdoptionList rows={model.exerciseAdoption} conversationsPath={conversationsPath} />
    </div>
  );
}

function SignalsFiltersForm({
  pathname,
  filters,
  agents,
}: {
  pathname: string;
  filters: SignalsFilters;
  agents: readonly string[];
}) {
  const extras = signalsFilterExtras(filters);

  return (
    <div className="flex flex-col gap-4">
      <PeriodPicker pathname={pathname} period={filters.period} extras={extras} />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="period" value={filters.period} />
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="text-text-muted">Agent</span>
          <Select name="agent" defaultValue={filters.agentId ?? ""}>
            <option value="">Alle agents</option>
            {agents.map((agentId) => (
              <option key={agentId} value={agentId}>
                {agentLabel(agentId)}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
    </div>
  );
}

function QuestionList({
  title,
  description,
  empty,
  rows,
  total,
  conversationsPath,
}: {
  title: string;
  description: string;
  empty: string;
  rows: QuestionSignal[];
  total?: number;
  conversationsPath: string;
}) {
  const listTotal = total ?? rows.length;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <p className="mt-1 text-sm text-text-muted">{description}</p>
        {listTotal > rows.length ? (
          <p className="mt-1 text-xs text-text-subtle">
            Toont {formatCount(rows.length)} van {formatCount(listTotal)} groepen.
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.latestEventId}>
              <QuestionCard
                row={row}
                permalink={conversationPermalink(conversationsPath, row.latestEventId)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionCard({ row, permalink }: { row: QuestionSignal; permalink: string }) {
  return (
    <Card variant="flush" className="flex flex-col gap-2 p-4">
      <Link href={permalink} className="text-sm text-text hover:underline">
        {row.question}
      </Link>
      <p className="text-xs text-text-muted">
        {formatCount(row.occurrenceCount)}× · laatst {dateTime.format(row.lastOccurredAt)}
      </p>
    </Card>
  );
}

function AdoptionList({
  rows,
  conversationsPath,
}: {
  rows: ExerciseAdoptionRow[];
  conversationsPath: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text">Adoptie oefenagent</h3>
        <p className="mt-1 text-sm text-text-muted">
          Gekozen scenario&apos;s en waar sessies zijn afgebroken. Staat buiten de kennisgatlijst.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">Geen oefensessies in deze selectie.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const id = row.latestAbandonedId ?? row.latestSessionId;
            return (
              <li key={row.scenarioSlug}>
                <Card variant="flush" className="flex flex-col gap-2 p-4">
                  <Link
                    href={conversationPermalink(conversationsPath, id)}
                    className="text-sm font-medium text-text hover:underline"
                  >
                    {row.scenarioSlug}
                  </Link>
                  <p className="text-xs text-text-muted">
                    {formatCount(row.abandonedCount)} afgebroken · {formatCount(row.completedCount)}{" "}
                    afgerond · {formatCount(row.maxTurnsReachedCount)} beurten op ·{" "}
                    {formatCount(row.sessionCount)} sessies · laatst{" "}
                    {dateTime.format(row.lastStartedAt)}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
