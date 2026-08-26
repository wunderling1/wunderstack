import { AGENT_KEYS, AGENT_KEY_LABELS } from "@wunderstack/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wunderstack/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Platform agent-type index (S3). Release and gates live on the type; placements live on
 * `/admin/funds/[fundKey]/agents/[agentKey]`. No write actions here.
 *
 * Lists every instance key. The roleplay agent joined the list in fase 6, when it got a gate family
 * of its own (DECISION-roleplay-agent.md R1).
 */
export default function AgentsTypeIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Agenttypes</h2>
        <p className="mt-1 text-sm text-text-muted">
          Release-manifest en gates horen bij het type. Plaatsingen en distributie vind je per fonds.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Sleutel</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {AGENT_KEYS.map((id) => (
            <TableRow key={id}>
              <TableCell className="font-medium">{AGENT_KEY_LABELS[id]}</TableCell>
              <TableCell className="font-mono text-sm text-text-muted">{id}</TableCell>
              <TableCell>
                <Link
                  href={`/admin/agents/${id}`}
                  className="text-sm text-primary hover:underline"
                >
                  Release &amp; gates
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
