import { getAgentActivity } from "@wunderstack/analytics";
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
import { agentLabel, getReleaseManifest } from "@/lib/release-manifest";
import { sinceDaysAgo } from "@/lib/window";

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
  const activity = (await getAgentActivity(sinceDaysAgo(WINDOW_DAYS))).filter(
    (row) => row.agentId === agentId,
  );

  const total = activity.reduce((sum, row) => sum + row.total, 0);
  const errors = activity.reduce((sum, row) => sum + row.errors, 0);
  const answered = activity.reduce((sum, row) => sum + row.answeredWithCitations, 0);
  const status = deriveStatus(total, errors);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-sm text-text-muted hover:underline">
          ← Overzicht
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
              value={<Chip variant="refusal">{manifest.gateStatus === "unknown" ? "n.n.b." : manifest.gateStatus}</Chip>}
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
            className={buttonVariants({ variant: "secondary", size: "default" })}
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
        <SectionTitle>Activiteit ({WINDOW_DAYS} dagen)</SectionTitle>
        {activity.length === 0 ? (
          <p className="text-sm text-text-subtle">Geen activiteit in deze periode.</p>
        ) : (
          <>
            <div className="mb-3 text-sm text-text-muted">
              Totaal {num(total)} vragen · {total === 0 ? "—" : pct(answered / total)} beantwoord met
              geverifieerde citaties.
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Fonds</TableHead>
                  <TableHead>Vragen</TableHead>
                  <TableHead>Beantwoord*</TableHead>
                  <TableHead>Fouten</TableHead>
                  <TableHead>Laatste activiteit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.map((row, index) => (
                  <TableRow key={`${row.tenantId}-${row.fund}-${index}`}>
                    <TableCell>{row.tenantId}</TableCell>
                    <TableCell>{row.fund}</TableCell>
                    <TableCell>{num(row.total)}</TableCell>
                    <TableCell>
                      {row.total === 0 ? "—" : pct(row.answeredWithCitations / row.total)}
                    </TableCell>
                    <TableCell>{num(row.errors)}</TableCell>
                    <TableCell className="whitespace-nowrap text-text-muted">
                      {dateTime.format(row.lastOccurredAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
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
