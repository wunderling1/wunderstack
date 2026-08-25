import { getKpiSummary, getRecentInteractions } from "@wunderstack/analytics";
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
import { getReleaseManifest } from "@/lib/release-manifest";
import { sinceDaysAgo } from "@/lib/window";

const WINDOW_DAYS = 30;
const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const num = (value: number) => value.toLocaleString("nl-NL");
const nnb = (value: string | null) => value ?? "n.n.b.";

/** Agent KPI + stub release overview. Shared by admin and fund faces; this surface is read-only. */
export async function AgentOverviewPanel({
  fundKey,
  agentKey,
}: {
  fundKey: string;
  agentKey: string;
}) {
  const win = { fundKey, agentId: agentKey, since: sinceDaysAgo(WINDOW_DAYS) };
  const [summary, log] = await Promise.all([
    getKpiSummary(win),
    getRecentInteractions(win, 25),
  ]);
  const manifest = getReleaseManifest(agentKey);

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
          <KpiTile label="Onbeantwoord (geweigerd)" value={num(summary.refused)} />
        </div>
      </section>

      <section>
        <SectionTitle>Release-manifest</SectionTitle>
        {manifest.stub ? (
          <p className="mb-3 text-sm text-text-muted">
            Release-tag en gate-status komen uit het release-manifest. Tot die bron beschikbaar is:
            n.n.b.
          </p>
        ) : null}
        <Table>
          <TableBody>
            <ManifestRow label="Release-tag" value={nnb(manifest.releaseTag)} />
            <ManifestRow
              label="Gate-status"
              value={
                <Chip variant="refusal">
                  {manifest.gateStatus === "unknown" ? "n.n.b." : manifest.gateStatus}
                </Chip>
              }
            />
          </TableBody>
        </Table>
      </section>

      <section>
        <SectionTitle>Recente interacties</SectionTitle>
        {log.length === 0 ? (
          <p className="text-sm text-text-subtle">Nog geen interacties voor deze agent.</p>
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
                  <TableCell>{row.outcome}</TableCell>
                  <TableCell>{num(row.citationCount)}</TableCell>
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
  return <h3 className="mb-3 text-sm font-semibold text-text">{children}</h3>;
}

function ManifestRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <TableRow>
      <TableCell className="w-48 text-text-muted">{label}</TableCell>
      <TableCell>{value}</TableCell>
    </TableRow>
  );
}
