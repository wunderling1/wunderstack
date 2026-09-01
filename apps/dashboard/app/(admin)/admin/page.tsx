import {
  answerRate,
  listOutcomeActivity,
  type OutcomeActivityRow,
} from "@wunderstack/analytics";
import {
  AgentStatusBadge,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wunderstack/ui";
import Link from "next/link";
import { answerRateDisplay, statusFromCounts } from "@/lib/admin-overview";
import { formatCount, totalQuestions } from "@/lib/overview";
import { agentLabel, KNOWN_AGENTS } from "@/lib/release-manifest";
import { sinceDaysAgo } from "@/lib/window";

/** KPI surface — always fetch. Config tabs are cached separately. */
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });

interface AdminRow {
  fundKey: string;
  agentId: string;
  total: number;
  answered: ReturnType<typeof answerRate>;
  status: ReturnType<typeof statusFromCounts>;
  lastOccurredAt: Date | null;
}

function rowFromActivity(row: OutcomeActivityRow): AdminRow {
  return {
    fundKey: row.fundKey,
    agentId: row.agentId,
    total: totalQuestions(row.byOutcome),
    answered: answerRate(row.byOutcome),
    status: statusFromCounts(row.byOutcome),
    lastOccurredAt: row.lastOccurredAt,
  };
}

export default async function AdminOverview() {
  const activity = await listOutcomeActivity(sinceDaysAgo(WINDOW_DAYS));
  const rows = activity.map(rowFromActivity);

  const seen = new Set(activity.map((row) => row.agentId));
  const missing: AdminRow[] = KNOWN_AGENTS.filter((agent) => !seen.has(agent.id)).map((agent) => ({
    fundKey: "—",
    agentId: agent.id,
    total: 0,
    answered: { kind: "no_measurable_turns" },
    status: "offline",
    lastOccurredAt: null,
  }));

  const allRows = [...rows, ...missing];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text">Agent-overzicht</h2>
          <p className="mt-1 text-sm text-text-muted">
            Activiteit per agent per fonds, laatste {WINDOW_DAYS} dagen. Release- en gate-velden
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
            <TableRow key={`${row.agentId}-${row.fundKey}-${index}`}>
              <TableCell className="font-medium">{agentLabel(row.agentId)}</TableCell>
              <TableCell className="text-text-muted">{row.fundKey}</TableCell>
              <TableCell>{formatCount(row.total)}</TableCell>
              <TableCell>{answerRateDisplay(row.answered, row.total)}</TableCell>
              <TableCell>
                <AgentStatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                <Chip variant="refusal">n.n.b.</Chip>
              </TableCell>
              <TableCell className="whitespace-nowrap text-text-muted">
                {row.lastOccurredAt ? dateTime.format(row.lastOccurredAt) : "—"}
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
        * Beantwoordingsgraad = beantwoord / (beantwoord + geweigerd + verduidelijkt). Fouten en
        rijen van vóór de meting zitten niet in de noemer. Geen latency/token/modelscores — die
        blijven in Langfuse.
      </p>
    </div>
  );
}
