import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { AgentTabNav } from "@/components/fund/agent-tab-nav";
import { getInstanceCached } from "@/lib/fund-lookups";
import { agentLabel } from "@/lib/release-manifest";
import { parseAgentKey } from "@/lib/route-params";

export default async function FundAgentLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ agentKey: string }>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect("/login");
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
      <AgentTabNav view="fund" fundKey={tenantId} agentKey={agentKey} />
      {children}
    </div>
  );
}
