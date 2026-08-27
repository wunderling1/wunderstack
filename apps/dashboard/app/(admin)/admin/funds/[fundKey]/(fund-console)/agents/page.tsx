import { AGENT_KEY_LABELS, AGENT_KEYS } from "@wunderstack/shared";
import { Card, Chip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wunderstack/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFundCached, listInstancesCached } from "@/lib/fund-lookups";
import { agentLabel } from "@/lib/release-manifest";
import { parseFundKey } from "@/lib/route-params";
import { AddAgentForm } from "../../manage-forms";

export default async function FundAgentsPage({
  params,
}: {
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = parseFundKey(raw);
  if (!fundKey) notFound();

  const fund = await getFundCached(fundKey);
  if (!fund) notFound();

  const instances = await listInstancesCached(fundKey);
  const present = new Set(instances.map((row) => row.agentKey));
  const remainingAgents = AGENT_KEYS.filter((id) => !present.has(id)).map((id) => ({
    id,
    label: AGENT_KEY_LABELS[id],
  }));
  const active = fund.status === "active";

  return (
    <div className="flex flex-col gap-4">
      {instances.length === 0 ? (
        <p className="text-sm text-text-subtle">Nog geen agent-instances.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Public key</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.map((row) => (
              <TableRow key={row.agentKey}>
                <TableCell>
                  <Link
                    href={`/admin/funds/${fund.key}/agents/${row.agentKey}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {agentLabel(row.agentKey)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Chip variant={row.status === "active" ? "verified" : "refusal"}>{row.status}</Chip>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.publicKey}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {active ? (
        <Card className="p-5">
          <AddAgentForm fundKey={fund.key} agents={remainingAgents} />
        </Card>
      ) : null}
    </div>
  );
}
