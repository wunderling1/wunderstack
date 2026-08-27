"use client";

import { NavPills, navPillClassName } from "@wunderstack/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { agentTabHref, agentTabs } from "@/lib/agent-tabs";

export function AgentTabNav({
  fundKey,
  agentKey,
}: {
  fundKey: string;
  agentKey: string;
}) {
  const pathname = usePathname();
  const base = `/admin/funds/${fundKey}/agents/${agentKey}`;
  const tabs = agentTabs(agentKey);

  return (
    <NavPills role="tablist" aria-label="Agenttabbladen">
      {tabs.map((tab) => {
        const href = agentTabHref(fundKey, agentKey, tab.segment);
        const selected =
          tab.segment === ""
            ? pathname === base || pathname === `${base}/`
            : pathname.startsWith(`${base}/${tab.segment}`);
        return (
          <Link
            key={tab.segment || "overview"}
            href={href}
            prefetch={tab.segment !== ""}
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
