import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AgentOverviewPanel } from "@/components/fund/agent-overview-panel";
import { getInstanceCached } from "@/lib/fund-lookups";
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
    <AgentOverviewPanel
      fundKey={tenantId}
      agentKey={agentKey}
      gesprekkenHref={`/gesprekken?agent=${agentKey}`}
    />
  );
}
