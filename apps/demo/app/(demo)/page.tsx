import type { CSSProperties } from "react";
import { Chat } from "@/components/chat/chat";
import { getFundTheme } from "@/lib/fund-theme";

/**
 * Public CAO-agent demo. Streamed answers with source attribution; no auth (public).
 *
 * Optional `?fund=<key>` scopes answers to one O&O fund and applies its white-label theme
 * (colour/label/starters, see lib/fund-theme.ts).
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const fundParam = params.fund;
  const fund = typeof fundParam === "string" ? fundParam : undefined;
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
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <Chat
          {...(fund ? { fund } : {})}
          starters={theme.starters}
          tagline={theme.tagline}
        />
      </div>
    </main>
  );
}
