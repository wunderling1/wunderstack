import { ALL_FUNDS_KEY } from "./switcher-options.js";

/** Sidebar segments for the fund and admin fund-console shells (PR-1). Routes English (S7); labels Dutch. */
export const FUND_NAV_ITEMS = [
  { segment: "", label: "Overzicht" },
  { segment: "conversations", label: "Gesprekken" },
  { segment: "signals", label: "Signalen" },
  { segment: "agents", label: "Agents" },
  { segment: "settings", label: "Instellingen" },
] as const;

/** Platform-level items when the admin switcher is on "Alle fondsen". */
export const PLATFORM_NAV_ITEMS = [
  { href: "/admin", label: "Overzicht" },
  { href: "/admin/funds", label: "Fondsen" },
  { href: "/admin/agents", label: "Agents" },
] as const;

export type FundNavSegment = (typeof FUND_NAV_ITEMS)[number]["segment"];

export type FundNavView = "fund" | "admin";

export type ChromeNavMode = "fund" | "platform";

export interface ChromeNavLink {
  href: string;
  label: string;
  selected: boolean;
}

export interface AdminChromePath {
  nav: ChromeNavMode;
  fundKey: string | null;
  switcherKey: string;
}

export function fundNavHref(
  view: FundNavView,
  fundKey: string,
  segment: FundNavSegment,
): string {
  if (view === "fund") {
    return segment === "" ? "/" : `/${segment}`;
  }
  const base = `/admin/funds/${fundKey}`;
  return segment === "" ? base : `${base}/${segment}`;
}

/**
 * Which sidebar item is active. Agent detail (`…/agents/<agentKey>`) keeps Agents selected.
 * Legacy settings URLs (`branding`, `accounts`, `manage`) keep Instellingen selected until redirect.
 */
export function activeFundNavSegment(
  pathname: string,
  view: FundNavView,
  fundKey: string,
): FundNavSegment {
  if (view === "fund") {
    if (pathname === "/" || pathname === "") return "";
    if (pathname === "/conversations" || pathname.startsWith("/conversations/")) return "conversations";
    if (pathname === "/signals" || pathname.startsWith("/signals/")) return "signals";
    if (pathname === "/agents" || pathname.startsWith("/agents/")) return "agents";
    if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
    return "";
  }

  const base = `/admin/funds/${fundKey}`;
  if (pathname === base || pathname === `${base}/`) return "";
  if (pathname.startsWith(`${base}/conversations`)) return "conversations";
  if (pathname.startsWith(`${base}/signals`)) return "signals";
  if (pathname.startsWith(`${base}/agents`)) return "agents";
  if (
    pathname.startsWith(`${base}/settings`) ||
    pathname.startsWith(`${base}/branding`) ||
    pathname.startsWith(`${base}/accounts`) ||
    pathname.startsWith(`${base}/manage`)
  ) {
    return "settings";
  }
  return "";
}

export function activePlatformNavHref(pathname: string): string | null {
  if (pathname === "/admin" || pathname === "/admin/") return "/admin";
  if (pathname === "/admin/funds" || pathname === "/admin/funds/") return "/admin/funds";
  if (pathname.startsWith("/admin/agents")) return "/admin/agents";
  return null;
}

const FUND_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Derive chrome mode from an admin pathname (`/admin/funds` list ≠ a fund console). */
export function parseAdminChromePath(pathname: string): AdminChromePath {
  const match = pathname.match(/^\/admin\/funds\/([^/]+)/);
  const raw = match?.[1]?.toLowerCase() ?? "";
  const fundKey = FUND_KEY_RE.test(raw) ? raw : null;
  if (fundKey) {
    return { nav: "fund", fundKey, switcherKey: fundKey };
  }
  return { nav: "platform", fundKey: null, switcherKey: ALL_FUNDS_KEY };
}

export function chromeNavLinks(args: {
  view: FundNavView;
  nav: ChromeNavMode;
  fundKey: string;
  pathname: string;
}): ChromeNavLink[] {
  if (args.view === "admin" && args.nav === "platform") {
    const active = activePlatformNavHref(args.pathname);
    return PLATFORM_NAV_ITEMS.map((item) => ({
      href: item.href,
      label: item.label,
      selected: item.href === active,
    }));
  }

  const active = activeFundNavSegment(args.pathname, args.view, args.fundKey);
  return FUND_NAV_ITEMS.map((item) => ({
    href: fundNavHref(args.view, args.fundKey, item.segment),
    label: item.label,
    selected: active === item.segment,
  }));
}

/** Preserve the current section when switching funds (incl. Alle fondsen). */
export function switchFundNavHref(
  pathname: string,
  fromFundKey: string,
  toFundKey: string,
): string {
  if (toFundKey === ALL_FUNDS_KEY) {
    if (pathname.includes("/agents")) return "/admin/agents";
    return "/admin";
  }

  const fromBase = `/admin/funds/${fromFundKey}`;
  if (fromFundKey === ALL_FUNDS_KEY || !pathname.startsWith(fromBase)) {
    if (pathname.startsWith("/admin/agents")) {
      return fundNavHref("admin", toFundKey, "agents");
    }
    return fundNavHref("admin", toFundKey, "");
  }
  const rest = pathname.slice(fromBase.length);
  if (/^\/agents\/[^/]+/.test(rest)) {
    return fundNavHref("admin", toFundKey, "agents");
  }
  if (/^\/(branding|accounts|manage)(\/|$)/.test(rest)) {
    return fundNavHref("admin", toFundKey, "settings");
  }
  return `/admin/funds/${toFundKey}${rest}`;
}
