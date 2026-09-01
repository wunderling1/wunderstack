import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FundOverviewView } from "@/components/fund/overview";
import { loadOverviewModel } from "@/lib/overview-load";
import { parsePeriod } from "@/lib/period";
import { parseFundKey } from "@/lib/route-params";

/** KPI surface — always fetch. Config tabs are cached separately. */
export const dynamic = "force-dynamic";

export default async function FundOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ fundKey: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const [{ fundKey: raw }, { period: rawPeriod }, headerList] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const fundKey = parseFundKey(raw);
  if (!fundKey) notFound();

  const period = parsePeriod(rawPeriod);
  const pathname = headerList.get("x-pathname") ?? `/admin/funds/${fundKey}`;
  const model = await loadOverviewModel(fundKey, period);

  return (
    <FundOverviewView
      model={model}
      hrefs={{
        pathname,
        gesprekken: `/admin/funds/${fundKey}/gesprekken`,
        signalen: `/admin/funds/${fundKey}/signalen`,
        agents: `/admin/funds/${fundKey}/agents`,
        agent: (agentKey) => `/admin/funds/${fundKey}/agents/${agentKey}`,
      }}
    />
  );
}
