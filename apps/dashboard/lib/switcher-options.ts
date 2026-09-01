import type { SessionShape } from "./authz.js";

/** Sentinel value for the admin "Alle fondsen" platform overview. */
export const ALL_FUNDS_KEY = "__all__";

export interface SwitcherOption {
  key: string;
  name: string;
}

export interface FundOption {
  key: string;
  name: string;
}

/**
 * Fund switcher options derived from session role — not from the URL.
 * Fund users get none (tenant is the session; no switcher). Admins see all
 * active funds plus "Alle fondsen".
 */
export function buildSwitcherOptions(
  session: SessionShape,
  activeFunds: FundOption[],
): SwitcherOption[] {
  const user = session?.user;
  if (!user || user.role !== "admin") return [];

  return [
    { key: ALL_FUNDS_KEY, name: "Alle fondsen" },
    ...activeFunds.map((fund) => ({ key: fund.key, name: fund.name })),
  ];
}
