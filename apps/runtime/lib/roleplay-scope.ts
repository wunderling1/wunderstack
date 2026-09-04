import { bindClaimsToInstance, instanceFromRow, type TenantConfig } from "@wunderstack/db";
import { parseCaoFunds } from "@wunderstack/shared";

import { resolveFundScope } from "./fund-scope";

/**
 * Request-scoped fund for the roleplay routes.
 *
 * Deliberately not `resolveRequestScope`: that resolver also picks an agent, and on the unkeyed path
 * it fails with `no_agent_instance` when `RUNTIME_UNCONFIGURED_AGENT` is unset. Roleplay is not one
 * of the grounded agent instances — it has no corpus, no `agent_config` row and no entry in
 * `AGENT_PROFILES` (DECISION-roleplay-agent.md, R1) — so demanding one would make a fund that only
 * runs roleplay unserveable.
 *
 * What it keeps is the part that is actually a security control: the client's `fund` is a claim, not
 * an authorization. A keyed request is bound to its instance's fund; an unkeyed one is checked
 * against the process allowlist. Either way the caller receives a fund it is allowed to read, and
 * `withFundSchema` opens exactly that schema.
 */

export type RoleplayScopeResult =
  | { ok: true; fund: string }
  | { ok: false; status: 400 | 403; error: string };

export function resolveRoleplayFund(
  config: TenantConfig | null,
  claimedFund: string | undefined,
  allow: string[] = parseCaoFunds(),
): RoleplayScopeResult {
  if (config) {
    const bound = bindClaimsToInstance(instanceFromRow(config), { fund: claimedFund });
    if (!bound.ok) {
      return bound;
    }
    // The process allowlist still applies: an instance fund outside CAO_FUNDS is a misconfiguration,
    // not a fund this process may quietly start serving.
    return resolveFundScope(bound.instance.fundKey, allow);
  }

  return resolveFundScope(claimedFund, allow);
}
