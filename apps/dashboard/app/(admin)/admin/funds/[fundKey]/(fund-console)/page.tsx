import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FundOverviewView } from "@/components/fund/overview";
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
  const nowMs = Date.now();

  return (
    <FundOverviewView
      fundKey={fundKey}
      period={period}
      nowMs={nowMs}
      hrefs={{
        pathname,
        conversations: `/admin/funds/${fundKey}/conversations`,
        signals: `/admin/funds/${fundKey}/signals`,
        agents: `/admin/funds/${fundKey}/agents`,
        agent: (agentKey) => `/admin/funds/${fundKey}/agents/${agentKey}`,
      }}
    />
  );
}
