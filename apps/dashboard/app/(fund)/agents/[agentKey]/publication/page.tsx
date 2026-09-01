import { redirect } from "next/navigation";
import { isGroundedAgentKey, tenantTextsSchema } from "@wunderstack/shared";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AgentPublicationPanel } from "@/components/fund/agent-publication";
import { env } from "@/lib/env";
import { getFundCached, getInstanceCached } from "@/lib/fund-lookups";
import { agentLabel } from "@/lib/release-manifest";
import { parseAgentKey } from "@/lib/route-params";

function scriptBase(): string {
  return (env.EMBED_SCRIPT_BASE ?? "http://localhost:3000").replace(/\/$/, "");
}
export default async function FundAgentPublicationPage({
  params,
}: {
  params: Promise<{ agentKey: string }>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect("/login");
  const { agentKey: raw } = await params;
  const agentKey = parseAgentKey(raw);
  if (!agentKey) notFound();
  const [fund, instance] = await Promise.all([
    getFundCached(tenantId),
    getInstanceCached(tenantId, agentKey),
  ]);
  if (!instance) notFound();
  const displayName = fund?.name ?? tenantId;
  const texts = isGroundedAgentKey(agentKey)
    ? tenantTextsSchema.parse(instance.texts ?? {})
    : null;
  const snippet = `<script src="${scriptBase()}/embed.js" data-key="${instance.publicKey}" data-agent="${agentKey}" async></script>`;
  return (
    <AgentPublicationPanel
      fundKey={tenantId}
      agentKey={agentKey}
      fundName={displayName}
      agentLabel={agentLabel(agentKey)}
      publicKey={instance.publicKey}
      corsAllowlist={instance.corsAllowlist}
      texts={texts}
      snippet={snippet}
      canWrite={false}
    />
  );
}
