import {
  bindClaimsToInstance,
  getAgentConfig,
  instanceFromRow,
  parseAgentConfigData,
  retrievalScope,
  type TenantConfig,
} from "@wunderstack/db";
import { env, parseCaoFunds } from "@wunderstack/shared";

import { resolveAgentIdFromConfig } from "./agent.js";
import { resolveFundScope } from "./fund-scope.js";

/**
 * Request-scoped fund + agent from the resolved instance (keyed) or the process allowlist (unkeyed).
 * Client `fund` / `data-agent` never override the instance.
 */

export type RequestScopeResult =
  | { ok: true; fund: string; agentKey: string }
  | { ok: false; status: 400 | 403; error: string };

/**
 * @param unconfiguredAgentOverride Test seam. `null` forces unset (400 path). `undefined` (default)
 *   reads `RUNTIME_UNCONFIGURED_AGENT`. A string uses that agent id.
 */
export function resolveRequestScope(
  config: TenantConfig | null,
  claimedFund: string | undefined,
  allow: string[] = parseCaoFunds(),
  unconfiguredAgentOverride?: string | null,
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
  const unconfigured =
    unconfiguredAgentOverride === null
      ? undefined
      : (unconfiguredAgentOverride ?? env.RUNTIME_UNCONFIGURED_AGENT);
  const agentKey = resolveAgentIdFromConfig(null, unconfigured);
  if (agentKey === null) {
    return {
      ok: false,
      status: 400,
      error: "no_agent_instance",
    };
  }
  return { ok: true, fund: fund.fund, agentKey };
}

export async function loadCorpusVersion(fund: string, agentKey: string): Promise<string | undefined> {
  const row = await getAgentConfig(agentKey, fund).catch(() => null);
  return parseAgentConfigData(row?.config).corpusVersion;
}
