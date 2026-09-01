import { ROLEPLAY_SCENARIO_STATUS_LABELS, type RoleplayScenarioStatus } from "@wunderstack/shared";
import { Chip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wunderstack/ui";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isExerciseAgentKey } from "@/lib/agent-profile";
import { listScenariosCached } from "@/lib/fund-lookups";
import { parseAgentKey } from "@/lib/route-params";

function statusChip(status: string) {
  const label = ROLEPLAY_SCENARIO_STATUS_LABELS[status as RoleplayScenarioStatus] ?? status;
  const variant = status === "published" ? "verified" : status === "archived" ? "refusal" : "caution";
  return <Chip variant={variant}>{label}</Chip>;
}

export default async function FundAgentScenariosPage({
  params,
}: {
  params: Promise<{ agentKey: string }>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return null;

  const { agentKey: raw } = await params;
  const agentKey = parseAgentKey(raw);
  if (!agentKey || !isExerciseAgentKey(agentKey)) notFound();

  const scenarios = await listScenariosCached(tenantId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold">Scenario&apos;s</h3>
        <p className="mt-1 text-sm text-text-muted">
          Alleen-lezen. Scenario&apos;s beheert het platform.
        </p>
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
                <TableCell>{row.title.trim() || row.slug}</TableCell>
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
