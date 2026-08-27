/** Fund-level tab segments under `/admin/funds/[fundKey]`. */
export const FUND_TABS = [
  { segment: "", label: "Overzicht" },
  { segment: "agents", label: "Agents" },
  { segment: "branding", label: "Huisstijl" },
  { segment: "accounts", label: "Accounts" },
  { segment: "manage", label: "Beheer" },
] as const;

export type FundTabSegment = (typeof FUND_TABS)[number]["segment"];

export function fundTabHref(fundKey: string, segment: FundTabSegment): string {
  const base = `/admin/funds/${fundKey}`;
  return segment === "" ? base : `${base}/${segment}`;
}

/**
 * Which fund tab is active for a pathname. Agent detail pages
 * (`…/agents/<agentKey>`) keep the Agents tab current.
 * Those routes sit outside `(fund-console)`, so fund chrome is not mounted there.
 */
export function activeFundTab(pathname: string, fundKey: string): FundTabSegment {
  const base = `/admin/funds/${fundKey}`;
  if (pathname === base || pathname === `${base}/`) return "";
  if (pathname.startsWith(`${base}/agents`)) return "agents";
  if (pathname.startsWith(`${base}/branding`)) return "branding";
  if (pathname.startsWith(`${base}/accounts`)) return "accounts";
  if (pathname.startsWith(`${base}/manage`)) return "manage";
  return "";
}

/** Preserve the current fund tab when switching funds. */
export function switchFundHref(pathname: string, fromFundKey: string, toFundKey: string): string {
  const fromBase = `/admin/funds/${fromFundKey}`;
  if (!pathname.startsWith(fromBase)) {
    return fundTabHref(toFundKey, "");
  }
  const rest = pathname.slice(fromBase.length);
  // Drop agent detail to the agents list when switching funds.
  if (/^\/agents\/[^/]+/.test(rest)) {
    return fundTabHref(toFundKey, "agents");
  }
  return `/admin/funds/${toFundKey}${rest}`;
}

export function isAgentDetailPath(pathname: string, fundKey: string): boolean {
  return /^\/admin\/funds\/[^/]+\/agents\/[^/]+/.test(pathname) &&
    pathname.startsWith(`/admin/funds/${fundKey}/agents/`);
}
