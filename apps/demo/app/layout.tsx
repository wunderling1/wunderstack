import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// The nonce-based CSP in proxy.ts is generated per request, so pages must be rendered dynamically —
// a statically prerendered page has no request-time nonce and its inline scripts would be blocked.
// Setting this on the root layout forces the whole route tree dynamic. Acceptable for an interactive
// (chat/API-driven) demo; revisit if a genuinely static, cacheable page is ever added.
export const dynamic = "force-dynamic";

const sans = Inter({ subsets: ["latin"], variable: "--font-app-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Wunderstack — CAO-agent demo",
  description: "Stel je vraag over de CAO en krijg een antwoord met bronvermelding.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl" className={sans.variable}>
      <body className={`${sans.className} antialiased`}>{children}</body>
    </html>
  );
}
