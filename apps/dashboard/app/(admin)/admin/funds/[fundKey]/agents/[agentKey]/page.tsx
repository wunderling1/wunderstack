import { notFound } from "next/navigation";
import { AgentOverviewPanel } from "@/components/fund/agent-overview-panel";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";

/** KPI surface — always fetch. Config tabs are cached separately. */
export const dynamic = "force-dynamic";

export default async function AgentOverviewPage({
  params,
}: {
  params: Promise<{ fundKey: string; agentKey: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent } = await params;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  if (!fundKey || !agentKey) notFound();

  return (
    <AgentOverviewPanel
      fundKey={fundKey}
      agentKey={agentKey}
      conversationsHref={`/admin/funds/${fundKey}/conversations?agent=${agentKey}`}
    />
  );
}
