import { isGroundedAgentKey, tenantTextsSchema } from "@wunderstack/shared";
import { notFound } from "next/navigation";
import { LtiPanel } from "../lti/lti-panel";
import { AgentPublicationPanel } from "@/components/fund/agent-publication";
import { env } from "@/lib/env";
import { getFundCached, getInstanceCached } from "@/lib/fund-lookups";
import { agentLabel } from "@/lib/release-manifest";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";

function scriptBase(): string {
  return (env.EMBED_SCRIPT_BASE ?? "http://localhost:3000").replace(/\/$/, "");
}

export default async function AgentPublicationPage({
  params,
}: {
  params: Promise<{ fundKey: string; agentKey: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent } = await params;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  if (!fundKey || !agentKey) notFound();

  const [fund, instance] = await Promise.all([
    getFundCached(fundKey),
    getInstanceCached(fundKey, agentKey),
  ]);
  if (!fund || !instance) notFound();

  const displayName = fund.name ?? fund.key;
  const texts = isGroundedAgentKey(agentKey)
    ? tenantTextsSchema.parse(instance.texts ?? {})
    : null;
  const snippet = `<script src="${scriptBase()}/embed.js" data-key="${instance.publicKey}" data-agent="${agentKey}" async></script>`;

  return (
    <AgentPublicationPanel
      fundKey={fund.key}
      agentKey={agentKey}
      fundName={displayName}
      agentLabel={agentLabel(agentKey)}
      publicKey={instance.publicKey}
      corsAllowlist={instance.corsAllowlist}
      texts={texts}
      snippet={snippet}
      canWrite
      extra={isGroundedAgentKey(agentKey) ? null : <LtiPanel fundKey={fund.key} />}
    />
  );
}
