"use client";

import { NavPills, navPillClassName } from "@wunderstack/ui";
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
    <NavPills role="tablist" aria-label="Fondstabbladen" className="mb-6">
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
            className={navPillClassName(selected)}
          >
            {tab.label}
          </Link>
        );
      })}
    </NavPills>
  );
}
