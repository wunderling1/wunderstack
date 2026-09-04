import Link from "next/link";
import type { ReactNode } from "react";

/** Shared header / main / footer for marketing canvases (black home vs white agent pages). */
export function MarketingChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <Link href="/" className="font-display text-xl font-normal">
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
    </>
  );
}
