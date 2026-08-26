import { listScenarios } from "@wunderstack/db";
import { ROLEPLAY_SCENARIO_STATUS_LABELS, type RoleplayScenarioStatus } from "@wunderstack/shared";
import { Chip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wunderstack/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";

export const dynamic = "force-dynamic";

function statusChip(status: string) {
  const label = ROLEPLAY_SCENARIO_STATUS_LABELS[status as RoleplayScenarioStatus] ?? status;
  const variant = status === "published" ? "verified" : status === "archived" ? "refusal" : "caution";
  return <Chip variant={variant}>{label}</Chip>;
}

export default async function RoleplayScenariosPage({
  params,
}: {
  params: Promise<{ fundKey: string; agentKey: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent } = await params;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  if (!fundKey || agentKey !== "roleplay") notFound();

  const scenarios = await listScenarios(fundKey);
  const base = `/admin/funds/${fundKey}/agents/roleplay/scenarios`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Scenario&apos;s</h3>
          <p className="mt-1 text-sm text-text-muted">
            Eén plat scenario per slug. Geen blokkenbibliotheek, geen kopieerflow. Alleen
            gepubliceerde scenario&apos;s kunnen een sessie starten.
          </p>
        </div>
        <Link
          href={`${base}/new`}
          className="shrink-0 rounded-[var(--radius-control)] bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
        >
          Nieuw scenario
        </Link>
      </div>

      {scenarios.length === 0 ? (
        <p className="text-sm text-text-subtle">Nog geen scenario&apos;s voor dit fonds.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titel</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Versie</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scenarios.map((row) => (
              <TableRow key={row.slug}>
                <TableCell>
                  <Link href={`${base}/${row.slug}`} className="font-medium text-primary hover:underline">
                    {row.title.trim() || row.slug}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                <TableCell>{statusChip(row.status)}</TableCell>
                <TableCell className="text-text-muted">{row.version}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
