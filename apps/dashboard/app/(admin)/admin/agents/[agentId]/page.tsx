import { getAgentActivity } from "@wunderstack/analytics";
import { listActiveFunds } from "@wunderstack/db";
import {
  AgentStatusBadge,
  buttonVariants,
  Card,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type AgentStatus,
} from "@wunderstack/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { getFundCached, listInstancesCached } from "@/lib/fund-lookups";
import { agentLabel, getReleaseManifest } from "@/lib/release-manifest";
import { sinceDaysAgo } from "@/lib/window";

/** KPI surface — always fetch. Config tabs are cached separately. */
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
const num = (value: number) => value.toLocaleString("nl-NL");
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const nnb = (value: string | null) => value ?? "n.n.b.";

function deriveStatus(total: number, errors: number): AgentStatus {
  if (total === 0) return "offline";
  return errors / total > 0.2 ? "degraded" : "operational";
}

export default async function AgentDetail({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const manifest = getReleaseManifest(agentId);
  const since = sinceDaysAgo(WINDOW_DAYS);
  const [activity, activeFunds] = await Promise.all([
    getAgentActivity(since),
    listActiveFunds(),
  ]);

  const agentActivity = activity.filter((row) => row.agentId === agentId);
  const total = agentActivity.reduce((sum, row) => sum + row.total, 0);
  const errors = agentActivity.reduce((sum, row) => sum + row.errors, 0);
  const answered = agentActivity.reduce((sum, row) => sum + row.answeredWithCitations, 0);
  const qualityN = total - errors;
  const status = deriveStatus(total, errors);

  const whereItRuns = (
    await Promise.all(
      activeFunds.map(async (fundRow) => {
        const [instances, fund] = await Promise.all([
          listInstancesCached(fundRow.key),
          getFundCached(fundRow.key),
        ]);
        const instance = instances.find((row) => row.agentKey === agentId);
        if (!instance) return null;
        const fundRows = agentActivity.filter((row) => row.fundKey === fundRow.key);
        const fundTotal = fundRows.reduce((sum, row) => sum + row.total, 0);
        const fundErrors = fundRows.reduce((sum, row) => sum + row.errors, 0);
        return {
          fundKey: fundRow.key,
          fundName: fund?.name ?? fundRow.key,
          questions: fundTotal,
          status: deriveStatus(fundTotal, fundErrors),
        };
      }),
    )
  ).filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <Link href="/admin/agents" className="text-sm text-text-muted hover:underline">
          ← Agenttypes
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <h2 className="font-display text-2xl font-semibold">{agentLabel(agentId)}</h2>
        <AgentStatusBadge status={status} />
      </div>

      {manifest.stub ? (
        <Card className="bg-state-caution-bg p-4 text-sm text-text">
          <p className="font-medium">Release-manifest nog niet beschikbaar.</p>
          <p className="mt-1 text-text-muted">
            Release-tag, gate-status en versies komen uit het release-manifest dat het
            gate-restructure-spoor levert. Tot dan tonen deze velden <strong>n.n.b.</strong> — er wordt
            geen groene gate verzonnen.
          </p>
        </Card>
      ) : null}

      <section>
        <SectionTitle>Release-manifest</SectionTitle>
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
            <ManifestRow label="Goldenset-versie" value={nnb(manifest.goldensetVersion)} />
            <ManifestRow label="Corpus-versie" value={nnb(manifest.corpusVersion)} />
            <ManifestRow label="Profiel-versie" value={nnb(manifest.profileVersion)} />
            <ManifestRow label="Invariant-versie" value={nnb(manifest.invariantVersion)} />
          </TableBody>
        </Table>
      </section>

      <section>
        <SectionTitle>Threshold-afwijkingen</SectionTitle>
        {manifest.thresholdDeviations.length === 0 ? (
          <p className="text-sm text-text-subtle">
            Geen afwijkingen geregistreerd (of nog geen manifest — zie hierboven).
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metriek</TableHead>
                <TableHead>Toelichting</TableHead>
                <TableHead>ADR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manifest.thresholdDeviations.map((deviation) => (
                <TableRow key={deviation.metric}>
                  <TableCell className="font-medium">{deviation.metric}</TableCell>
                  <TableCell>{deviation.note}</TableCell>
                  <TableCell>
                    {deviation.adrUrl ? (
                      <a href={deviation.adrUrl} className="text-primary hover:underline">
                        ADR
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <SectionTitle>Observability</SectionTitle>
        {manifest.langfuseUrl ? (
          <a
            href={manifest.langfuseUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "secondary", shape: "control" })}
          >
            Open in Langfuse
          </a>
        ) : (
          <p className="text-sm text-text-subtle">
            Langfuse-deeplink niet geconfigureerd (zet <code>LANGFUSE_BASE_URL</code>).
          </p>
        )}
      </section>

      <section>
        <SectionTitle>Waar draait deze agent</SectionTitle>
        <p className="mb-3 text-sm text-text-muted">
          Read-only overzicht van plaatsingen. Distributie en sleutels beheer je per fonds.
        </p>
        {whereItRuns.length === 0 ? (
          <p className="text-sm text-text-subtle">Nog geen fondsen met deze agent.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonds</TableHead>
                <TableHead>Vragen ({WINDOW_DAYS}d)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {whereItRuns.map((row) => (
                <TableRow key={row.fundKey}>
                  <TableCell>
                    <div className="font-medium">{row.fundName}</div>
                    <div className="font-mono text-xs text-text-muted">{row.fundKey}</div>
                  </TableCell>
                  <TableCell>{num(row.questions)}</TableCell>
                  <TableCell>
                    <AgentStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/funds/${row.fundKey}/agents/${agentId}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {total > 0 && agentActivity[0] ? (
          <p className="mt-3 text-sm text-text-muted">
            Totaal {num(total)} vragen · {pct(qualityN === 0 ? 0 : answered / qualityN)} beantwoord
            met geverifieerde citaties (timeout en fout tellen niet mee). Laatste activiteit{" "}
            {dateTime.format(
              agentActivity.reduce(
                (latest, row) => (row.lastOccurredAt > latest ? row.lastOccurredAt : latest),
                agentActivity[0].lastOccurredAt,
              ),
            )}
            .
          </p>
        ) : null}
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
