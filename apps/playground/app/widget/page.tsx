import { Chat } from "@/components/chat/chat";
import { availableFunds } from "@/lib/fund-scope";
import { getFundTheme } from "@/lib/fund-theme";

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
  const requestedFund = typeof fundParam === "string" ? fundParam : undefined;

  const funds = availableFunds();
  const fund = requestedFund && funds.includes(requestedFund) ? requestedFund : (funds[0] as string);
  const theme = getFundTheme(fund);

  return (
    <main className="h-dvh bg-page" data-fund={fund}>
      <Chat embedded fund={fund} starters={theme.starters} tagline={theme.tagline} />
    </main>
  );
}
