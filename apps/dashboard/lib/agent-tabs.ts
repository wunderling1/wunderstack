/** Agent-instance tabs under `/admin/funds/[fundKey]/agents/[agentKey]`. */

export interface AgentTab {
  segment: string;
  label: string;
}

/**
 * Grounded agents keep Teksten (tagline, starters). Roleplay has no chat chrome to theme that way;
 * its authored data is scenarios, and its LMS coupling is LTI. Distributie stays on both: CORS and
 * the public key are how the learner UI authenticates.
 */
export function agentTabs(agentKey: string): AgentTab[] {
  const tabs: AgentTab[] = [
    { segment: "", label: "Overzicht" },
    { segment: "distribution", label: "Distributie" },
  ];
  if (agentKey === "roleplay") {
    tabs.push({ segment: "scenarios", label: "Scenario's" });
    tabs.push({ segment: "lti", label: "LTI" });
  } else {
    tabs.push({ segment: "texts", label: "Teksten" });
  }
  return tabs;
}

export function agentTabHref(fundKey: string, agentKey: string, segment: string): string {
  const base = `/admin/funds/${fundKey}/agents/${agentKey}`;
  return segment === "" ? base : `${base}/${segment}`;
}
