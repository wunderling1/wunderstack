import { count, eq, funds, getDb, listInstances, users } from "@wunderstack/db";
import { getAgentActivity } from "@wunderstack/analytics";
import { AGENT_KEY_LABELS, AGENT_KEYS } from "@wunderstack/shared";
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
import { agentLabel } from "@/lib/release-manifest";
import { sinceDaysAgo } from "@/lib/window";
import { CreateFundForm } from "./create-form";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

/** Honest status: no events → not live (never green). Activity uses the same rules as /admin. */
function deriveFundStatus(total: number, errors: number): { status: AgentStatus; label: string } {
  if (total === 0) return { status: "offline", label: "Nog niet live" };
  if (errors / total > 0.2) return { status: "degraded", label: "Beperkt" };
  return { status: "operational", label: "Actief" };
}

export default async function FundsAdminPage() {
  const [fundRows, inactiveRows, activity] = await Promise.all([
    getDb().select().from(funds).where(eq(funds.status, "active")).orderBy(funds.key),
    getDb().select().from(funds).where(eq(funds.status, "inactive")).orderBy(funds.key),
    getAgentActivity(sinceDaysAgo(WINDOW_DAYS)),
  ]);

  const rows = await Promise.all(
    fundRows.map(async (fund) => {
      const [instances, accountRows] = await Promise.all([
        listInstances(fund.key),
        getDb().select({ n: count() }).from(users).where(eq(users.tenantId, fund.key)),
      ]);
      const fundActivity = activity.filter((row) => row.fundKey === fund.key);
      const total = fundActivity.reduce((sum, row) => sum + row.total, 0);
      const errors = fundActivity.reduce((sum, row) => sum + row.errors, 0);
      const { status, label } = deriveFundStatus(total, errors);
      return {
        key: fund.key,
        name: fund.name ?? fund.key,
        agents: instances.map((row) => row.agentKey),
        accounts: Number(accountRows[0]?.n ?? 0),
        status,
        statusLabel: label,
        total,
      };
    }),
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-start gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Fondsen</h2>
          <p className="mt-1 text-sm text-text-muted">
            Overzicht van control.funds. Status is afgeleid van echte activiteit — geen verzonnen
            groene gate.
          </p>
        </div>
        <Link href="/admin" className="ml-auto whitespace-nowrap text-sm text-text-muted hover:text-text">
          ← Beheer
        </Link>
      </div>

      <CreateFundForm
        agents={AGENT_KEYS.map((id) => ({ id, label: AGENT_KEY_LABELS[id] }))}
      />

      <section>
        <h3 className="mb-3 text-sm font-semibold text-text">Overzicht</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-text-subtle">Nog geen fondsen geregistreerd.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonds</TableHead>
                <TableHead>Agents</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead>Vragen ({WINDOW_DAYS}d)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <Link href={`/admin/funds/${row.key}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                    <div className="font-mono text-xs text-text-muted">{row.key}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.agents.length === 0 ? (
                        <Chip variant="refusal">geen</Chip>
                      ) : (
                        row.agents.map((agent) => (
                          <Chip key={agent} variant="verified">
                            {agentLabel(agent)}
                          </Chip>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{row.accounts}</TableCell>
                  <TableCell>{row.total.toLocaleString("nl-NL")}</TableCell>
                  <TableCell>
                    <AgentStatusBadge status={row.status} label={row.statusLabel} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/funds/${row.key}`} className="text-sm text-primary hover:underline">
                      Beheren
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {inactiveRows.length > 0 ? (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-text">Gedeactiveerd</h3>
          <p className="mb-3 text-sm text-text-muted">
            Soft-delete: schema en accounts blijven staan. Geen DROP. Alleen-lezen vanuit het
            overzicht — open het fonds voor dump of accounts.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonds</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {inactiveRows.map((fund) => (
                <TableRow key={fund.key}>
                  <TableCell>
                    <div className="font-medium">{fund.name ?? fund.key}</div>
                    <div className="font-mono text-xs text-text-muted">{fund.key}</div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/funds/${fund.key}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Bekijken
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
