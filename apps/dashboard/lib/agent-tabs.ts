import { isGroundedAgentKey } from "@wunderstack/shared";

/** Agent-instance tabs: Overzicht · Corpus|Scenario's · Publicatie (S13). */

export type AgentTabView = "fund" | "admin";

export interface AgentTab {
  segment: string;
  label: string;
}

/**
 * Middle tab follows profile type (D3): Corpus for grounded-on-text, Scenario's for exercise.
 * Never an empty corpus tab on an exercise agent.
 */
export function agentTabs(agentKey: string): AgentTab[] {
  const middle: AgentTab = isGroundedAgentKey(agentKey)
    ? { segment: "corpus", label: "Corpus" }
    : { segment: "scenarios", label: "Scenario's" };
  return [
    { segment: "", label: "Overzicht" },
    middle,
    { segment: "publication", label: "Publicatie" },
  ];
}

export function agentTabHref(
  view: AgentTabView,
  fundKey: string,
  agentKey: string,
  segment: string,
): string {
  const base =
    view === "fund"
      ? `/agents/${agentKey}`
      : `/admin/funds/${fundKey}/agents/${agentKey}`;
  return segment === "" ? base : `${base}/${segment}`;
}

export function agentInstanceBase(view: AgentTabView, fundKey: string, agentKey: string): string {
  return agentTabHref(view, fundKey, agentKey, "");
}

export function isAgentTabSelected(pathname: string, base: string, segment: string): boolean {
  if (segment === "") {
    return pathname === base || pathname === `${base}/`;
  }
  return pathname === `${base}/${segment}` || pathname.startsWith(`${base}/${segment}/`);
}
