import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AgentOverviewPanel } from "@/components/fund/agent-overview-panel";
import { getInstanceCached } from "@/lib/fund-lookups";
import { agentLabel } from "@/lib/release-manifest";
import { parseAgentKey } from "@/lib/route-params";

/** KPI surface — always fetch. Config tabs are cached separately. */
export const dynamic = "force-dynamic";

/**
 * Fund-role agent overview. tenantId comes from the session only — never from the URL —
 * so a fund user cannot read another fund by rewriting the path (S5 / PR-E DoD).
 */
export default async function FundAgentPage({
  params,
}: {
  params: Promise<{ agentKey: string }>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return null;

  const { agentKey: raw } = await params;
  const agentKey = parseAgentKey(raw);
  if (!agentKey) notFound();

  const instance = await getInstanceCached(tenantId, agentKey);
  if (!instance) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg font-semibold">{agentLabel(agentKey)}</h2>
        <p className="mt-1 font-mono text-sm text-text-muted">{agentKey}</p>
      </div>
      <AgentOverviewPanel fundKey={tenantId} agentKey={agentKey} />
    </div>
  );
}
