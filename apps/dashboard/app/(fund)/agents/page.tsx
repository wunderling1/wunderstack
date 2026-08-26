import { listInstances } from "@wunderstack/db";
import { Chip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wunderstack/ui";
import Link from "next/link";
import { auth } from "@/auth";
import { agentLabel } from "@/lib/release-manifest";

export const dynamic = "force-dynamic";

export default async function FundAgentsListPage() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return null;

  const instances = await listInstances(tenantId);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Agents van jouw fonds. Alleen-lezen — distributie, teksten en scenario&apos;s beheert het
        platform.
      </p>
      {instances.length === 0 ? (
        <p className="text-sm text-text-subtle">Nog geen agent-instances.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.map((row) => (
              <TableRow key={row.agentKey}>
                <TableCell>
                  <Link
                    href={`/agents/${row.agentKey}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {agentLabel(row.agentKey)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Chip variant={row.status === "active" ? "verified" : "refusal"}>{row.status}</Chip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
