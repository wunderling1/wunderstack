import Link from "next/link";
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
  pathname,
}: {
  view: AgentTabView;
  fundKey: string;
  agentKey: string;
  pathname: string;
}) {
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
            prefetch={tab.segment !== ""}
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
