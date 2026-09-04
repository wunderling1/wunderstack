import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MarketingChrome } from "@/components/marketing-chrome";
import { themeColor } from "@/lib/page-theme";
import "../globals.css";

export const metadata: Metadata = {
  title: "Wunderstack — AI-agents voor O&O fondsen",
  description:
    "Fonds-overstijgende AI-agents die je één keer bouwt en per fonds configureert. Soeverein, " +
    "gegrond en insluitbaar. Eerste agent: de CAO-agent.",
};

export function generateViewport(): Viewport {
  return { themeColor: themeColor("white") };
}

/** Agent detail canvas — white product default. Static; no `headers()` / force-dynamic. */
export default function WhiteLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body className="antialiased bg-page text-text">
        <MarketingChrome>{children}</MarketingChrome>
      </body>
    </html>
  );
}
