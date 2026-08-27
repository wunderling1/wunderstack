import { getFundOverview } from "@wunderstack/analytics";
import { notFound } from "next/navigation";
import { FundActivityPanels } from "@/components/fund/activity-panels";
import { FundKpiTiles } from "@/components/fund/kpi-tiles";
import { parseFundKey } from "@/lib/route-params";
import { sinceDaysAgo } from "@/lib/window";

/** KPI surface — always fetch. Config tabs are cached separately. */
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function FundOverviewPage({
  params,
}: {
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = parseFundKey(raw);
  if (!fundKey) notFound();

  const { summary, unanswered, themes, log } = await getFundOverview({
    fundKey,
    since: sinceDaysAgo(WINDOW_DAYS),
  });

  return (
    <div className="flex flex-col gap-10">
      <FundKpiTiles summary={summary} windowDays={WINDOW_DAYS} />
      <FundActivityPanels themes={themes} unanswered={unanswered} log={log} />
    </div>
  );
}
