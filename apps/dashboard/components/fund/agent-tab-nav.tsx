"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavPills, navPillClassName } from "@wunderstack/ui";
import {
  agentInstanceBase,
  agentTabHref,
  agentTabs,
  isAgentTabSelected,
  type AgentTabView,
} from "@/lib/agent-tabs";

export function AgentTabNav({
  view,
  fundKey,
  agentKey,
}: {
  view: AgentTabView;
  fundKey: string;
  agentKey: string;
}) {
  const pathname = usePathname();
  const base = agentInstanceBase(view, fundKey, agentKey);
  const tabs = agentTabs(agentKey);

  return (
    <NavPills aria-label="Agenttabbladen">
      {tabs.map((tab) => {
        const href = agentTabHref(view, fundKey, agentKey, tab.segment);
        const selected = isAgentTabSelected(pathname, base, tab.segment);
        return (
          <Link
            key={tab.segment || "overview"}
            href={href}
            // Partial prefetch (default) warms the tab shell; `true` would fetch the whole
            // dynamic route for every tab in the bar. See DashboardSidebar for the reasoning.
            prefetch={selected ? false : undefined}
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
