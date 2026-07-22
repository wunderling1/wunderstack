import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wunderstack — AI-agents voor O&O fondsen",
  description:
    "Fonds-overstijgende AI-agents die je één keer bouwt en per fonds configureert. Soeverein, " +
    "gegrond en insluitbaar. Eerste agent: de CAO-agent.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body className="antialiased bg-surface text-text">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
            <Link href="/" className="font-display text-base font-semibold">
              Wunderstack
            </Link>
            <nav className="ml-auto flex items-center gap-6 text-sm text-text-muted">
              <Link href="/#catalogus" className="hover:text-text">
                Catalogus
              </Link>
              <Link href="/agents/cao" className="hover:text-text">
                CAO-agent
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-12">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-text-subtle">
            Wunderstack — soevereine AI-infrastructuur voor Nederlandse O&O fondsen. Het standaard
            request-pad blijft EU-soeverein.
          </div>
        </footer>
      </body>
    </html>
  );
}
