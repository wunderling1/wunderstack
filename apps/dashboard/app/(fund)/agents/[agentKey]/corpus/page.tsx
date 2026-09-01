import { isGroundedAgentKey } from "@wunderstack/shared";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AgentCorpusPanel } from "@/components/fund/agent-corpus-panel";
import { getInstanceCached } from "@/lib/fund-lookups";
import { parseAgentKey } from "@/lib/route-params";

export default async function FundAgentCorpusPage({
  params,
}: {
  params: Promise<{ agentKey: string }>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return null;

  const { agentKey: raw } = await params;
  const agentKey = parseAgentKey(raw);
  if (!agentKey || !isGroundedAgentKey(agentKey)) notFound();

  const instance = await getInstanceCached(tenantId, agentKey);
  if (!instance) notFound();

  return (
    <AgentCorpusPanel
      fundKey={tenantId}
      agentKey={agentKey}
      pinnedReleaseTag={instance.pinnedReleaseTag}
      canWrite={false}
    />
  );
}
