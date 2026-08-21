import {
  bindClaimsToInstance,
  getAgentConfig,
  instanceFromRow,
  parseAgentConfigData,
  retrievalScope,
  type TenantConfig,
} from "@wunderstack/db";
import { parseCaoFunds } from "@wunderstack/shared";

import { resolveAgentIdFromConfig } from "./agent.js";
import { resolveFundScope } from "./fund-scope.js";

/**
 * Request-scoped fund + agent from the resolved instance (keyed) or the process allowlist (unkeyed).
 * Client `fund` / `data-agent` never override the instance.
 */

export type RequestScopeResult =
  | { ok: true; fund: string; agentKey: string }
  | { ok: false; status: 400 | 403; error: string };

export function resolveRequestScope(
  config: TenantConfig | null,
  claimedFund: string | undefined,
  allow: string[] = parseCaoFunds(),
): RequestScopeResult {
  if (config) {
    const bound = bindClaimsToInstance(instanceFromRow(config), { fund: claimedFund });
    if (!bound.ok) {
      return bound;
    }
    // Process allowlist still applies: an instance fund not in CAO_FUNDS is a misconfiguration.
    const allowlisted = resolveFundScope(bound.instance.fundKey, allow);
    if (!allowlisted.ok) {
      return allowlisted;
    }
    const scope = retrievalScope(bound.instance);
    return { ok: true, fund: scope.fund, agentKey: scope.agentKey };
  }

  const fund = resolveFundScope(claimedFund, allow);
  if (!fund.ok) {
    return fund;
  }
  return { ok: true, fund: fund.fund, agentKey: resolveAgentIdFromConfig(null) };
}

export async function loadCorpusVersion(fund: string, agentKey: string): Promise<string | undefined> {
  const row = await getAgentConfig(agentKey, fund).catch(() => null);
  return parseAgentConfigData(row?.config).corpusVersion;
}
