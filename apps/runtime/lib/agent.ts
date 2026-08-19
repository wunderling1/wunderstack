import { getAgent, type GroundedAgent } from "@wunderstack/agents";

/**
 * Resolve the catalog agent id for this request from tenant config (server-side).
 * The embed `data-agent` attribute is a hint only — never overrides this value.
 */
export function resolveAgentIdFromConfig(config: { agentKey: string } | null | undefined): string {
  return config?.agentKey ?? "cao";
}

/**
 * Obtain a grounded agent instance by catalog id. Unknown ids throw — map to 4xx in the route.
 */
export function getAgentById(id: string): GroundedAgent {
  return getAgent(id);
}
