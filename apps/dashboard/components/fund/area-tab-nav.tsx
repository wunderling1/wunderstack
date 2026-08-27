"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const FUND_AREA_TABS = [
  { href: "/", label: "Overzicht", match: (path: string) => path === "/" },
  {
    href: "/agents",
    label: "Agents",
    match: (path: string) => path === "/agents" || path.startsWith("/agents/"),
  },
] as const;

/** Tab nav for the fund-role face. No fund switcher; tenant comes from the session. */
export function FundAreaTabNav() {
  const pathname = usePathname();

  return (
    <div
      role="tablist"
      aria-label="Fondstabbladen"
      className="mb-6 inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-border bg-surface-sunk p-1"
    >
      {FUND_AREA_TABS.map((tab) => {
        const selected = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={tab.href !== "/"}
            role="tab"
            aria-selected={selected}
            aria-current={selected ? "page" : undefined}
            className={
              selected
                ? "rounded-[var(--radius-input)] bg-surface px-3 py-1.5 text-sm font-medium text-text shadow-[var(--elevation-card)]"
                : "rounded-[var(--radius-input)] px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
