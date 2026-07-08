import type { CSSProperties } from "react";
import { Chat } from "@/components/chat/chat";
import { FundSelector } from "@/components/chat/fund-selector";
import { availableFunds } from "@/lib/fund-scope";
import { getFundTheme } from "@/lib/fund-theme";

/**
 * Public CAO-agent demo. Streamed answers with source attribution; no auth (public).
 *
 * `?fund=<key>` scopes answers to one O&O fund (one session = one corpus) and applies its
 * white-label theme (colour/label/starters, see lib/fund-theme.ts). When no fund is given, the
 * first available fund is selected so a corpus is always active (fund-scope enforces isolation).
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

  const themeVars = { "--primary": theme.primary, "--ring": theme.primary } as CSSProperties;

  return (
    <main className="flex h-dvh flex-col" style={themeVars}>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-sm font-semibold">{theme.logoText}</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">{theme.label}</h1>
            <p className="text-xs text-muted-foreground">{theme.tagline}</p>
          </div>
          <div className="ml-auto">
            <FundSelector funds={funds} active={fund} />
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <Chat fund={fund} starters={theme.starters} tagline={theme.tagline} />
      </div>
    </main>
  );
}
