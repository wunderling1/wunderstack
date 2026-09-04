import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MarketingChrome } from "@/components/marketing-chrome";
import { htmlMode, themeColor } from "@/lib/page-theme";
import "../globals.css";

export const metadata: Metadata = {
  title: "Wunderstack — AI-agents voor O&O fondsen",
  description:
    "Fonds-overstijgende AI-agents die je één keer bouwt en per fonds configureert. Soeverein, " +
    "gegrond en insluitbaar. Eerste agent: de CAO-agent.",
};

export function generateViewport(): Viewport {
  return { themeColor: themeColor("black") };
}

/** Home canvas — black (`data-mode="dark"`). Static; no `headers()` / force-dynamic. */
export default function BlackLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" data-mode={htmlMode("black")}>
      <body className="antialiased bg-page text-text">
        <MarketingChrome>{children}</MarketingChrome>
      </body>
    </html>
  );
}
