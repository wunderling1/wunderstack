import { Button, Card, Select } from "@wunderstack/ui";
import Link from "next/link";
import {
  SIGNAL_LIST_LIMIT,
  type ExerciseAdoptionRow,
  type QuestionSignal,
} from "@wunderstack/analytics";
import { MeasurementNote } from "@/components/fund/measurement-note";
import { PeriodPicker } from "@/components/fund/period-picker";
import { UpdatedAt } from "@/components/fund/updated-at";
import {
  comparisonLine,
  formatPeriodThrough,
  formatRelativeToNow,
} from "@/lib/activity-copy";
import { conversationPermalink } from "@/lib/conversations";
import { formatCount } from "@/lib/overview";
import { periodHref } from "@/lib/period";
import { agentLabel } from "@/lib/release-manifest";
import { type SignalsFilters } from "@/lib/signals";
import type { SignalsModel } from "@/lib/signals-load";

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
  const showMeasurementNote =
    model.measurementStartedAt !== null &&
    model.windowSince.getTime() < model.measurementStartedAt.getTime();

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-text">Signalen</h2>
          <p className="mt-1 text-sm text-text-muted">
            Onbeantwoorde vragen — letterlijke formuleringen, geen gegenereerde thema&apos;s.
          </p>
        </div>
        <UpdatedAt at={readAt} />
      </div>

      <SignalsFiltersForm pathname={pathname} filters={model.filters} agents={model.agents} />

      {showMeasurementNote ? (
        <MeasurementNote startedAt={model.measurementStartedAt} />
      ) : null}

      <KnowledgeGapsSection
        pathname={pathname}
        conversationsPath={conversationsPath}
        model={model}
        readAt={readAt}
      />

      {showSuspicious ? (
        <QuestionList
          title="Verdachte weigeringen"
          description="Intern: geweigerd terwijl retrieval sterk was. Werk voor ons, niet voor het fonds."
          empty="Geen verdachte weigeringen in deze selectie."
          rows={model.suspiciousRefusals}
          conversationsPath={conversationsPath}
          readAt={readAt}
        />
      ) : null}

      <AdoptionList rows={model.exerciseAdoption} conversationsPath={conversationsPath} />
    </div>
  );
}

function KnowledgeGapsSection({
  pathname,
  conversationsPath,
  model,
  readAt,
}: {
  pathname: string;
  conversationsPath: string;
  model: SignalsModel;
  readAt: Date;
}) {
  const unit = model.knowledgeGapsTotal === 1 ? "onbeantwoorde vraag" : "onbeantwoorde vragen";
  const top = model.topKnowledgeGaps;
  const shownQuestions = model.knowledgeGaps.reduce((sum, row) => sum + row.occurrenceCount, 0);
  const page = model.filters.page;
  const pageCount = Math.max(1, Math.ceil(model.knowledgeGapsGroupTotal / SIGNAL_LIST_LIMIT));
  const extrasWithoutPage = { agent: model.filters.agentId };

  return (
    <section className="flex flex-col gap-6">
      <Card variant="flush" className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">Kennisgaten</h3>
          <p className="text-sm text-text-muted">
            {formatPeriodThrough(model.filters.period, readAt)}
          </p>
        </div>
        <div>
          <p className="font-display text-3xl font-semibold tabular-nums text-text">
            {formatCount(model.knowledgeGapsTotal)}
          </p>
          <p className="mt-1 text-sm text-text-muted">{unit}</p>
          <p className="mt-2 text-sm text-text-subtle">
            {comparisonLine(
              model.knowledgeGapsTotal,
              model.previousKnowledgeGapsTotal,
              formatCount,
            )}
          </p>
        </div>
        {top.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Meest gesteld
            </p>
            <ol className="flex flex-col gap-2">
              {top.map((row, index) => (
                <li key={row.latestEventId} className="flex gap-3 text-sm text-text">
                  <span className="tabular-nums text-text-muted">{index + 1}.</span>
                  <Link
                    href={conversationPermalink(conversationsPath, row.latestEventId)}
                    className="min-w-0 flex-1 hover:underline"
                  >
                    {row.question}
                  </Link>
                  <span className="shrink-0 tabular-nums text-text-muted">
                    {formatCount(row.occurrenceCount)}×
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </Card>

      {model.knowledgeGapsTotal === 0 ? (
        <p className="text-sm text-text-subtle">
          Geen onbeantwoorde vragen in deze periode. Er zijn{" "}
          {formatCount(model.questionsAsked)} vragen gesteld en{" "}
          {formatCount(model.questionsAnswered)} beantwoord.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text">Alle onbeantwoorde vragen</h3>
            {model.knowledgeGapsGroupTotal > model.knowledgeGaps.length ? (
              <p className="mt-1 text-xs text-text-subtle">
                Toont {formatCount(shownQuestions)} van {formatCount(model.knowledgeGapsTotal)}{" "}
                vragen.
              </p>
            ) : null}
          </div>
          <ul className="flex flex-col gap-3">
            {model.knowledgeGaps.map((row) => (
              <li key={`${row.agentKey}:${row.latestEventId}`}>
                <QuestionCard
                  row={row}
                  permalink={conversationPermalink(conversationsPath, row.latestEventId)}
                  readAt={readAt}
                />
              </li>
            ))}
          </ul>
          {pageCount > 1 ? (
            <nav className="flex flex-wrap items-center gap-3 text-sm" aria-label="Paginering">
              {page > 1 ? (
                <Link
                  href={periodHref(pathname, model.filters.period, {
                    ...extrasWithoutPage,
                    page: page === 2 ? undefined : String(page - 1),
                  })}
                  className="text-primary hover:underline"
                >
                  Vorige
                </Link>
              ) : null}
              <span className="text-text-muted">
                Pagina {formatCount(page)} van {formatCount(pageCount)}
              </span>
              {page < pageCount ? (
                <Link
                  href={periodHref(pathname, model.filters.period, {
                    ...extrasWithoutPage,
                    page: String(page + 1),
                  })}
                  className="text-primary hover:underline"
                >
                  Volgende
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      )}
    </section>
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
  // Period/agent changes drop the page back to 1 — do not carry `page` into this form.
  const extras = { agent: filters.agentId };

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
  conversationsPath,
  readAt,
}: {
  title: string;
  description: string;
  empty: string;
  rows: QuestionSignal[];
  conversationsPath: string;
  readAt: Date;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <p className="mt-1 text-sm text-text-muted">{description}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={`${row.agentKey}:${row.latestEventId}`}>
              <QuestionCard
                row={row}
                permalink={conversationPermalink(conversationsPath, row.latestEventId)}
                readAt={readAt}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function corpusHintLabel(hint: QuestionSignal["corpusHint"]): string {
  if (hint === "none") return "geen enkele bron geraakt";
  return "raakt bronnen, maar te zwak";
}

function QuestionCard({
  row,
  permalink,
  readAt,
}: {
  row: QuestionSignal;
  permalink: string;
  readAt: Date;
}) {
  const actorUnit = row.distinctActors === 1 ? "verschillende gebruiker" : "verschillende gebruikers";
  return (
    <Card variant="flush" className="flex flex-col gap-2 p-4">
      <Link href={permalink} className="text-sm text-text hover:underline">
        {row.question}
      </Link>
      <p className="text-xs text-text-muted">
        {formatCount(row.occurrenceCount)}× · {formatCount(row.distinctActors)} {actorUnit} ·{" "}
        {agentLabel(row.agentKey)} · {corpusHintLabel(row.corpusHint)} · laatst{" "}
        {formatRelativeToNow(row.lastOccurredAt, readAt)}
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
  const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
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
