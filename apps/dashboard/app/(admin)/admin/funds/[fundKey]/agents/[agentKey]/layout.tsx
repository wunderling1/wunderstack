import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Breadcrumbs,
} from "@wunderstack/ui";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AgentTabNav } from "@/components/fund/agent-tab-nav";
import { getFundCached, getInstanceCached } from "@/lib/fund-lookups";
import { agentLabel } from "@/lib/release-manifest";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";

export default async function AgentInstanceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ fundKey: string; agentKey: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent } = await params;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  if (!fundKey || !agentKey) {
    notFound();
  }

  const [fund, instance, headerList] = await Promise.all([
    getFundCached(fundKey),
    getInstanceCached(fundKey, agentKey),
    headers(),
  ]);
  if (!fund || !instance) {
    notFound();
  }

  const displayName = fund.name ?? fund.key;
  const label = agentLabel(agentKey);
  const pathname = headerList.get("x-pathname") ?? `/admin/funds/${fund.key}/agents/${agentKey}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Breadcrumbs>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/funds">Fondsen</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/admin/funds/${fund.key}`}>{displayName}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{label}</BreadcrumbPage>
          </BreadcrumbItem>
        </Breadcrumbs>
        <h2 className="font-display text-lg font-semibold">{label}</h2>
        <p className="font-mono text-sm text-text-muted">
          {fund.key} · {agentKey}
        </p>
      </div>

      <AgentTabNav view="admin" fundKey={fund.key} agentKey={agentKey} pathname={pathname} />

      {children}
    </div>
  );
}
