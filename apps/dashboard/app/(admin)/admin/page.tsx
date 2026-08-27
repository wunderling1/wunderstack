import { getAgentActivity, type AgentActivityRow } from "@wunderstack/analytics";
import {
  AgentStatusBadge,
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
import { agentLabel, KNOWN_AGENTS } from "@/lib/release-manifest";
import { sinceDaysAgo } from "@/lib/window";

/** KPI surface — always fetch. Config tabs are cached separately. */
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
const num = (value: number) => value.toLocaleString("nl-NL");
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** Honest operational status derived from real activity — never a dressed-up green (§1). */
function deriveStatus(total: number, errors: number): AgentStatus {
  if (total === 0) return "offline";
  return errors / total > 0.2 ? "degraded" : "operational";
}

interface AdminRow extends AgentActivityRow {
  status: AgentStatus;
  rate: number;
}

export default async function AdminOverview() {
  const activity = await getAgentActivity(sinceDaysAgo(WINDOW_DAYS));

  const rows: AdminRow[] = activity.map((row) => ({
    ...row,
    status: deriveStatus(row.total, row.errors),
    rate: row.total === 0 ? 0 : row.answeredWithCitations / row.total,
  }));

  // Show known agents that logged nothing this window as "offline", so the catalog is always visible.
  const seen = new Set(activity.map((row) => row.agentId));
  const missing: AdminRow[] = KNOWN_AGENTS.filter((agent) => !seen.has(agent.id)).map((agent) => ({
    fundKey: "—",
    tenantId: "—",
    agentId: agent.id,
    fund: "—",
    total: 0,
    answeredWithCitations: 0,
    refused: 0,
    errors: 0,
    lastOccurredAt: new Date(0),
    status: "offline",
    rate: 0,
  }));

  const allRows = [...rows, ...missing];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text">Agent-overzicht</h2>
          <p className="mt-1 text-sm text-text-muted">
            Activiteit per agent per instance, laatste {WINDOW_DAYS} dagen. Release- en gate-velden
            komen uit het release-manifest (nog niet beschikbaar — zie het gate-restructure-spoor).
          </p>
        </div>
        <Link
          href="/admin/funds"
          className="ml-auto whitespace-nowrap text-sm text-primary hover:underline"
        >
          Fondsen →
        </Link>
        <Link
          href="/admin/agents"
          className="whitespace-nowrap text-sm text-primary hover:underline"
        >
          Agenttypes →
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Fonds</TableHead>
            <TableHead>Vragen</TableHead>
            <TableHead>Beantwoord*</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Release</TableHead>
            <TableHead>Laatste activiteit</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {allRows.map((row, index) => (
            <TableRow key={`${row.agentId}-${row.tenantId}-${index}`}>
              <TableCell className="font-medium">{agentLabel(row.agentId)}</TableCell>
              <TableCell className="text-text-muted">
                <div>{row.fundKey === "—" ? "—" : row.fundKey}</div>
                {row.tenantId !== "—" && row.tenantId !== row.fundKey ? (
                  <div className="text-xs text-text-subtle">runtime {row.tenantId}</div>
                ) : null}
              </TableCell>
              <TableCell>{num(row.total)}</TableCell>
              <TableCell>{row.total === 0 ? "—" : pct(row.rate)}</TableCell>
              <TableCell>
                <AgentStatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                <Chip variant="refusal">n.n.b.</Chip>
              </TableCell>
              <TableCell className="whitespace-nowrap text-text-muted">
                {row.total === 0 ? "—" : dateTime.format(row.lastOccurredAt)}
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/agents/${row.agentId}`}
                  className="text-sm text-primary hover:underline"
                >
                  Details
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-xs text-text-subtle">
        * Beantwoord met geverifieerde citaties (v1-maat). Geen latency/token/modelscores — die blijven
        in Langfuse.
      </p>
    </div>
  );
}
