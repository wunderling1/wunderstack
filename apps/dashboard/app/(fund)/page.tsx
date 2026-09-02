import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FundOverviewView } from "@/components/fund/overview";
import { parsePeriod } from "@/lib/period";

/** KPI surface — always fetch. Config tabs are cached separately. */
export const dynamic = "force-dynamic";
export default async function FundDashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect("/login");
  const [{ period: rawPeriod }, headerList] = await Promise.all([searchParams, headers()]);
  const period = parsePeriod(rawPeriod);
  const pathname = headerList.get("x-pathname") ?? "/";
  // One clock for the whole render: the section loaders are cached on it, so two sections asking
  // for the same window get one read instead of two windows a millisecond apart.
  const nowMs = Date.now();
  return (
    <FundOverviewView
      fundKey={tenantId}
      period={period}
      nowMs={nowMs}
      hrefs={{
        pathname,
        conversations: "/conversations",
        signals: "/signals",
        agents: "/agents",
        agent: (agentKey) => `/agents/${agentKey}`,
      }}
    />
  );
}
