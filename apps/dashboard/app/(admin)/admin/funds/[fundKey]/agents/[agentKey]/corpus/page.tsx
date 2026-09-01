import { isGroundedAgentKey } from "@wunderstack/shared";
import { notFound } from "next/navigation";
import { AgentCorpusPanel } from "@/components/fund/agent-corpus-panel";
import { getInstanceCached } from "@/lib/fund-lookups";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";

export default async function AgentCorpusPage({
  params,
}: {
  params: Promise<{ fundKey: string; agentKey: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent } = await params;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  if (!fundKey || !agentKey || !isGroundedAgentKey(agentKey)) notFound();

  const instance = await getInstanceCached(fundKey, agentKey);
  if (!instance) notFound();

  return (
    <AgentCorpusPanel
      fundKey={fundKey}
      agentKey={agentKey}
      pinnedReleaseTag={instance.pinnedReleaseTag}
      canWrite
    />
  );
}
