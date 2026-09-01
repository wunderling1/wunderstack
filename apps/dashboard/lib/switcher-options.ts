import { decideAccess, type SessionShape } from "./authz.js";

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
 * Fund switcher options derived from the authorisation layer — not from the URL and not from a
 * second role comparison here. "May switch funds" is the same question as "may enter the admin
 * area", so it is asked once, in `decideAccess`. A fund user gets none: the tenant is the session.
 */
export function buildSwitcherOptions(
  session: SessionShape,
  activeFunds: FundOption[],
): SwitcherOption[] {
  if (!decideAccess(session, "admin").allow) return [];

  return [
    { key: ALL_FUNDS_KEY, name: "Alle fondsen" },
    ...activeFunds.map((fund) => ({ key: fund.key, name: fund.name })),
  ];
}
