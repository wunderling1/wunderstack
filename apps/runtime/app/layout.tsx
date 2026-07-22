import type { Metadata } from "next";
import type { ReactNode } from "react";

// The Wunderstack runtime is an API-only deployable (see docs/plans/PLAN-ui-ecosystem.md, D14). It
// carries no UI; this minimal root layout exists only so Next can render the health page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wunderstack runtime",
  description: "Agent API surface.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
