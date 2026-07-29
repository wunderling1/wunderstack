import { Chat } from "@/components/chat/chat";
import { FundSelector } from "@/components/chat/fund-selector";
import { availableFunds } from "@/lib/fund-scope";
import { getFundTheme } from "@/lib/fund-theme";

/**
 * Public CAO-agent demo. Streamed answers with source attribution; no auth (public).
 */
export default async function DemoPage({
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
    <main className="flex h-dvh flex-col" data-fund={fund}>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-on-primary">
            <span className="text-sm font-semibold">{theme.logoText}</span>
          </div>
          <h1 className="text-sm font-semibold leading-tight">{theme.label}</h1>
          <div className="ml-auto">
            <FundSelector funds={funds} active={fund} />
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <Chat fund={fund} starterCategories={theme.starterCategories} />
      </div>
    </main>
  );
}
