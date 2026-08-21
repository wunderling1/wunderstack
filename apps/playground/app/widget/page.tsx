import { Chat } from "@/components/chat/chat";
import { availableFunds } from "@/lib/fund-scope";
import { getFundTheme } from "@/lib/fund-theme";
import { fetchTenantPublicConfig, type PlaygroundAgent } from "@/lib/runtime-config";

/**
 * Embeddable chat, rendered inside the widget iframe (see public/widget/widget.js). Minimal chrome:
 * the host page provides the frame. Same-origin with /api/chat, so no CORS needed.
 */
export default async function WidgetPage({
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
    <main className="h-dvh bg-page" data-fund={fund} data-agent={agent}>
      <Chat
        embedded
        fund={fund}
        agent={agent}
        starterCategories={starterCategories}
        starterTitle={tenantConfig?.texts.tagline}
        starterIntro={tenantConfig?.texts.intro}
        statusLabels={tenantConfig?.statusLabels}
      />
    </main>
  );
}
