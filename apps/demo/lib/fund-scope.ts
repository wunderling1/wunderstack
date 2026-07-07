import { env } from "@wunderstack/shared";

/**
 * Server-side authorization of the `fund` scope (security-audit finding #2, BOLA / data-plane
 * isolation). The chat API must not trust the client's `fund` as an authorization claim: a caller
 * could omit it to search *every* fund's corpus, or substitute another fund's key.
 *
 * This resolves the effective fund against a trusted allowlist (`CAO_FUNDS`), instead of blindly
 * trusting client input:
 *   - allowlist SET   → the requested fund must be on it; omitting it uses the single configured
 *     fund, or is refused when several are configured (the unscoped "all funds" query is never
 *     served to public traffic);
 *   - allowlist UNSET → local/dev only: the request is passed through unchanged. Production MUST set
 *     `CAO_FUNDS` (see .env.example). This is the seam; once a real auth layer exists, the fund is
 *     derived from the authenticated principal instead.
 */

export type FundScopeResult =
  | { ok: true; fund: string | undefined }
  | { ok: false; status: 400 | 403; error: string };

function allowedFunds(): string[] {
  const raw = env.CAO_FUNDS;
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function resolveFundScope(requested: string | undefined): FundScopeResult {
  const allow = allowedFunds();

  // Dev/local: no allowlist configured — preserve current behaviour but do not invent isolation.
  if (allow.length === 0) {
    return { ok: true, fund: requested };
  }

  if (requested === undefined) {
    // Never serve an unscoped (all-funds) query. Default only when there is exactly one fund.
    if (allow.length === 1) {
      return { ok: true, fund: allow[0] };
    }
    return { ok: false, status: 400, error: "fund_required" };
  }

  if (!allow.includes(requested)) {
    return { ok: false, status: 403, error: "fund_not_allowed" };
  }

  return { ok: true, fund: requested };
}
