import {
  getKpiSummary,
  getRecentInteractions,
  getTopThemes,
  getUnansweredQuestions,
} from "@wunderstack/analytics";
import {
  Chip,
  KpiTile,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wunderstack/ui";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { getCorpusOverview } from "@/lib/corpus";
import { sinceDaysAgo } from "@/lib/window";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const num = (value: number) => value.toLocaleString("nl-NL");

export default async function FundDashboard() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  // The (fund) layout already gated this; the guard keeps types honest for the queries below.
  if (!tenantId) return null;

  const win = { tenantId, since: sinceDaysAgo(WINDOW_DAYS) };
  const [summary, unanswered, themes, log, corpus] = await Promise.all([
    getKpiSummary(win),
    getUnansweredQuestions(win, 20),
    getTopThemes(win),
    getRecentInteractions(win, 25),
    getCorpusOverview(tenantId),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <SectionTitle>Laatste {WINDOW_DAYS} dagen</SectionTitle>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiTile label="Vragen" value={num(summary.total)} />
          <KpiTile
            label="Beantwoord met geverifieerde citaties"
            value={pct(summary.answeredWithCitationsRate)}
            hint="v1-maat: alleen geverifieerde citaties"
          />
          <KpiTile label="Verduidelijking gevraagd" value={num(summary.clarified)} />
          <KpiTile
            label="Onbeantwoord (geweigerd)"
            value={num(summary.refused)}
            hint="corpus-roadmap-signaal"
          />
        </div>
      </section>

      <section>
        <SectionTitle>Top-thema&apos;s</SectionTitle>
        {themes.length === 0 ? (
          <EmptyNote>Nog geen thema-classificatie beschikbaar.</EmptyNote>
        ) : (
          <div className="flex flex-wrap gap-2">
            {themes.map((theme) => (
              <Chip key={theme.theme} variant="verified">
                {theme.theme} · {num(theme.count)}
              </Chip>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Onbeantwoorde vragen</SectionTitle>
        {unanswered.length === 0 ? (
          <EmptyNote>Geen geweigerde vragen in deze periode.</EmptyNote>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vraag</TableHead>
                <TableHead>Wanneer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unanswered.map((row, index) => (
                <TableRow key={`${row.occurredAt.toISOString()}-${index}`}>
                  <TableCell>{row.question}</TableCell>
                  <TableCell className="whitespace-nowrap text-text-muted">
                    {dateTime.format(row.occurredAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <SectionTitle>Query-log</SectionTitle>
        {log.length === 0 ? (
          <EmptyNote>Nog geen interacties.</EmptyNote>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Wanneer</TableHead>
                <TableHead>Vraag</TableHead>
                <TableHead>Uitkomst</TableHead>
                <TableHead>Citaties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.map((row, index) => (
                <TableRow key={`${row.occurredAt.toISOString()}-${index}`}>
                  <TableCell className="whitespace-nowrap text-text-muted">
                    {dateTime.format(row.occurredAt)}
                  </TableCell>
                  <TableCell>{row.question ?? "—"}</TableCell>
                  <TableCell>
                    <OutcomeChip outcome={row.outcome} />
                  </TableCell>
                  <TableCell>{row.citationCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <SectionTitle>Corpus (read-only)</SectionTitle>
        {corpus.length === 0 ? (
          <EmptyNote>Geen corpusdocumenten gevonden voor dit fonds.</EmptyNote>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Versie</TableHead>
                <TableHead>Passages</TableHead>
                <TableHead>Ingeladen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {corpus.map((doc, index) => (
                <TableRow key={`${doc.title}-${index}`}>
                  <TableCell>{doc.title}</TableCell>
                  <TableCell className="font-mono text-xs">{doc.version}</TableCell>
                  <TableCell>{num(doc.chunkCount)}</TableCell>
                  <TableCell className="whitespace-nowrap text-text-muted">
                    {dateTime.format(doc.ingestedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-text">{children}</h2>;
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-subtle">{children}</p>;
}

function OutcomeChip({ outcome }: { outcome: string }) {
  const variant =
    outcome === "answered"
      ? "verified"
      : outcome === "clarified"
        ? "caution"
        : outcome === "error"
          ? "danger"
          : "refusal";
  const label =
    outcome === "answered"
      ? "Beantwoord"
      : outcome === "clarified"
        ? "Verduidelijkt"
        : outcome === "error"
          ? "Fout"
          : "Geweigerd";
  return <Chip variant={variant}>{label}</Chip>;
}
