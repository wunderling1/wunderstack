import type { CSSProperties } from "react";
import { Chat } from "@/components/chat/chat";
import { getFundTheme } from "@/lib/fund-theme";

/**
 * Embeddable chat, rendered inside the widget iframe (see public/widget/widget.js). Minimal chrome:
 * the host page provides the frame. Same-origin with /api/chat, so no CORS needed.
 *
 * Optional `?fund=<key>` restricts answers to one O&O fund's CAO and applies its white-label theme
 * (colour/starters, see lib/fund-theme.ts).
 */
export default async function WidgetPage({
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
    <main className="h-dvh bg-background" style={themeVars}>
      <Chat
        embedded
        {...(fund ? { fund } : {})}
        starters={theme.starters}
        tagline={theme.tagline}
      />
    </main>
  );
}
