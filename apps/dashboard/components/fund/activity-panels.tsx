import type {
  InteractionLogRow,
  ThemeCount,
  UnansweredQuestion,
} from "@wunderstack/analytics";
import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wunderstack/ui";
import type { ReactNode } from "react";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
const num = (value: number) => value.toLocaleString("nl-NL");

/** Themes + unanswered + recent interactions — shared between admin and fund faces. */
export function FundActivityPanels({
  themes,
  unanswered,
  log,
  showOutcomeChip = false,
}: {
  themes: ThemeCount[];
  unanswered: UnansweredQuestion[];
  log: InteractionLogRow[];
  showOutcomeChip?: boolean;
}) {
  return (
    <>
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
                <TableHead>Tijdstip</TableHead>
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
        <SectionTitle>Recente interacties</SectionTitle>
        {log.length === 0 ? (
          <EmptyNote>Nog geen interacties gelogd.</EmptyNote>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tijdstip</TableHead>
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
                    {showOutcomeChip ? <OutcomeChip outcome={row.outcome} /> : row.outcome}
                  </TableCell>
                  <TableCell>{num(row.citationCount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold text-text">{children}</h3>;
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
