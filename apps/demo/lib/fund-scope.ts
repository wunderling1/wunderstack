import { parseCaoFunds } from "@wunderstack/shared";

/**
 * Server-side authorization of the `fund` scope (security-audit finding #2, BOLA / data-plane
 * isolation) AND corpus isolation (one session = one corpus). The chat API must not trust the
 * client's `fund` as an authorization claim, and it must never run an unscoped "all funds" query:
 * mixing two CAOs in one answer is a correctness/tenancy break.
 *
 * This resolves the effective fund against a trusted allowlist (`CAO_FUNDS`):
 *   - allowlist SET   → the requested fund must be on it; omitting it uses the single configured
 *     fund, or is refused when several are configured (never an unscoped query);
 *   - allowlist UNSET → local/dev only: fall back to a concrete default fund instead of searching
 *     every corpus. Production MUST set `CAO_FUNDS` (see .env.example).
 *
 * The result always carries a concrete fund — the retrieval seam requires one.
 */

/** Dev fallback fund when no allowlist is configured (keeps corpus isolation even locally). */
const DEV_DEFAULT_FUND = "demo";

export type FundScopeResult =
  | { ok: true; fund: string }
  | { ok: false; status: 400 | 403; error: string };

function allowedFunds(): string[] {
  return parseCaoFunds();
}

/** Funds a client may choose between (for the UI selector). Falls back to a dev default in local. */
export function availableFunds(): string[] {
  const allow = allowedFunds();
  return allow.length > 0 ? allow : [DEV_DEFAULT_FUND];
}

export function resolveFundScope(requested: string | undefined): FundScopeResult {
  const allow = allowedFunds();

  // Dev/local: no allowlist configured — use the requested fund or a concrete default. Never
  // search all funds (corpus isolation is not negotiable).
  if (allow.length === 0) {
    return { ok: true, fund: requested && requested.length > 0 ? requested : DEV_DEFAULT_FUND };
  }

  if (requested === undefined) {
    // Never serve an unscoped (all-funds) query. Default only when there is exactly one fund.
    if (allow.length === 1) {
      return { ok: true, fund: allow[0] as string };
    }
    return { ok: false, status: 400, error: "fund_required" };
  }

  if (!allow.includes(requested)) {
    return { ok: false, status: 403, error: "fund_not_allowed" };
  }

  return { ok: true, fund: requested };
}
