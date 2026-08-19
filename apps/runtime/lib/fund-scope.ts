import { parseCaoFunds } from "@wunderstack/shared";
import { defaultFund } from "@wunderstack/tenant";

/**
 * Server-side authorization of the `fund` scope (security-audit finding #2, BOLA / data-plane
 * isolation) AND corpus isolation (one session = one corpus). The chat API must not trust the
 * client's `fund` as an authorization claim, and it must never run an unscoped "all funds" query:
 * mixing two CAOs in one answer is a correctness/tenancy break.
 *
 * This resolves the effective fund against a trusted allowlist (`CAO_FUNDS`):
 *   - allowlist SET   → the requested fund must be on it; omitting it uses the instance fund
 *     (never an unscoped all-funds query);
 *   - allowlist UNSET → local/dev only: fall back to a concrete default fund instead of searching
 *     every corpus. Production MUST set `CAO_FUNDS` (see .env.example).
 *
 * The result always carries a concrete fund — the retrieval seam requires one. The embed has no
 * fund selector (one tenant = one fund); it relies on this default when the client omits `fund`.
 */

export type FundScopeResult =
  | { ok: true; fund: string }
  | { ok: false; status: 400 | 403; error: string };

function allowedFunds(): string[] {
  return parseCaoFunds();
}

/** Funds a client may choose between (for the UI selector). Falls back to a dev default in local. */
export function availableFunds(): string[] {
  const allow = allowedFunds();
  return allow.length > 0 ? allow : [defaultFund()];
}

/**
 * The one fund this instance serves when the client omits `fund` (embed, MCP). Prefer the tenant
 * default when it is on the allowlist; otherwise the first configured fund. Never "all funds".
 */
export function instanceFund(
  allow: string[] = allowedFunds(),
  fallback: string = defaultFund(),
): string {
  if (allow.length === 0) return fallback;
  if (allow.includes(fallback)) return fallback;
  return allow[0] as string;
}

export function resolveFundScope(
  requested: string | undefined,
  allow: string[] = allowedFunds(),
): FundScopeResult {
  // Dev/local: no allowlist configured — use the requested fund or a concrete default. Never
  // search all funds (corpus isolation is not negotiable).
  if (allow.length === 0) {
    return { ok: true, fund: requested && requested.length > 0 ? requested : defaultFund() };
  }

  if (requested === undefined) {
    return { ok: true, fund: instanceFund(allow) };
  }

  if (!allow.includes(requested)) {
    return { ok: false, status: 403, error: "fund_not_allowed" };
  }

  return { ok: true, fund: requested };
}
