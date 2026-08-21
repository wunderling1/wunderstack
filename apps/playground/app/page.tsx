import { Chat } from "@/components/chat/chat";
import { PlaygroundSidebar } from "@/components/chat/playground-sidebar";
import { availableFunds } from "@/lib/fund-scope";
import { getFundTheme } from "@/lib/fund-theme";
import { fetchTenantPublicConfig, type PlaygroundAgent } from "@/lib/runtime-config";

/**
 * Public agent demo. Streamed answers with source attribution; no auth (public).
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const fundParam = params.fund;
  const agentParam = params.agent;
  const requestedFund = typeof fundParam === "string" ? fundParam : undefined;
  const agent: PlaygroundAgent = agentParam === "arbo" ? "arbo" : "cao";

  const funds = availableFunds(agent);
  const fund = requestedFund && funds.includes(requestedFund) ? requestedFund : (funds[0] as string);
  const theme = getFundTheme(fund);
  const tenantConfig = await fetchTenantPublicConfig(agent);
  const starterCategories =
    tenantConfig?.texts.starterCategories && tenantConfig.texts.starterCategories.length > 0
      ? tenantConfig.texts.starterCategories
      : theme.starterCategories;

  return (
    <main className="flex h-dvh flex-col md:flex-row" data-fund={fund} data-agent={agent}>
      <PlaygroundSidebar agent={agent} funds={funds} activeFund={fund} />
      <div className="min-w-0 flex-1 overflow-hidden bg-page">
        <Chat
          fund={fund}
          agent={agent}
          starterCategories={starterCategories}
          starterTitle={tenantConfig?.texts.tagline}
          starterIntro={tenantConfig?.texts.intro}
          statusLabels={tenantConfig?.statusLabels}
        />
      </div>
    </main>
  );
}
