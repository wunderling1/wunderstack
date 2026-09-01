import {
  deriveAgentStatus,
  getOutcomeBreakdown,
  getRecentInteractions,
  type OutcomeBreakdown,
} from "@wunderstack/analytics";
import { AgentStatusBadge, Chip, KpiTile, Table, TableBody, TableCell, TableRow } from "@wunderstack/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { agentShowsQualityColumns } from "@/lib/agent-profile";
import { formatCount, formatRate, totalTurns } from "@/lib/overview";
import { getReleaseManifest } from "@/lib/release-manifest";
import { sinceDaysAgo } from "@/lib/window";

const WINDOW_DAYS = 30;
const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
const nnb = (value: string | null) => value ?? "n.n.b.";

/** Agent KPI surface from PR-2. No second conversation list (PR-4). */
export async function AgentOverviewPanel({
  fundKey,
  agentKey,
  gesprekkenHref,
}: {
  fundKey: string;
  agentKey: string;
  gesprekkenHref: string;
}) {
  const since = sinceDaysAgo(WINDOW_DAYS);
  const window = { fundKey, agentId: agentKey, since };
  const [breakdown, recent] = await Promise.all([
    getOutcomeBreakdown(window),
    getRecentInteractions(window, 1),
  ]);
  const manifest = getReleaseManifest(agentKey);
  const total = totalTurns(breakdown.byOutcome);
  const status = deriveAgentStatus(total, breakdown.byOutcome.error);
  const lastAt = recent[0]?.occurredAt ?? null;
  const quality = agentShowsQualityColumns(agentKey);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>Laatste {WINDOW_DAYS} dagen</SectionTitle>
          <AgentStatusBadge
            status={status}
            label={status === "offline" ? "Nog niet live" : undefined}
          />
        </div>
        <OutcomeTiles breakdown={breakdown} quality={quality} />
      </section>

      <section>
        <SectionTitle>Laatste activiteit</SectionTitle>
        <p className="text-sm text-text">
          {lastAt ? dateTime.format(lastAt) : "Nog geen activiteit in deze periode."}
        </p>
        <p className="mt-2 text-sm">
          <Link href={gesprekkenHref} className="text-primary hover:underline">
            Alle gesprekken van deze agent
          </Link>
        </p>
      </section>

      <section>
        <SectionTitle>Release</SectionTitle>
        {manifest.stub ? (
          <p className="mb-3 text-sm text-text-muted">
            Release-tag komt uit het release-manifest. Tot die bron beschikbaar is: n.n.b.
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
    </div>
  );
}

function OutcomeTiles({
  breakdown,
  quality,
}: {
  breakdown: OutcomeBreakdown;
  quality: boolean;
}) {
  const total = totalTurns(breakdown.byOutcome);
  if (!quality) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiTile label="Sessies / turns" value={formatCount(total)} />
        </div>
        <p className="text-sm text-text-muted">
          Deze agent oefent; er is geen citatie- of weigermetriek.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <KpiTile label="Turns" value={formatCount(total)} />
      <KpiTile label="Beantwoord" value={formatRate(breakdown.rates.answered)} />
      <KpiTile label="Geweigerd" value={formatRate(breakdown.rates.refused)} />
      <KpiTile label="Verduidelijkt" value={formatRate(breakdown.rates.clarified)} />
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-text">{children}</h3>;
}

function ManifestRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <TableRow>
      <TableCell className="w-48 text-text-muted">{label}</TableCell>
      <TableCell>{value}</TableCell>
    </TableRow>
  );
}
