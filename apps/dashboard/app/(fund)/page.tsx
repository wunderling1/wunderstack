import { headers } from "next/headers";
import { auth } from "@/auth";
import { FundOverviewView } from "@/components/fund/overview";
import { loadOverviewModel } from "@/lib/overview-load";
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
  if (!tenantId) return null;

  const [{ period: rawPeriod }, headerList] = await Promise.all([searchParams, headers()]);
  const period = parsePeriod(rawPeriod);
  const pathname = headerList.get("x-pathname") ?? "/";
  const model = await loadOverviewModel(tenantId, period);

  return (
    <FundOverviewView
      model={model}
      hrefs={{
        pathname,
        gesprekken: "/gesprekken",
        signalen: "/signalen",
        agents: "/agents",
        agent: (agentKey) => `/agents/${agentKey}`,
      }}
    />
  );
}
