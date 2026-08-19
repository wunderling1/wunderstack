import { getAgent, type CaoAgent } from "@wunderstack/agents";

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
export function getAgentById(id: string): CaoAgent {
  return getAgent(id);
}

/**
 * Lazily reuse the CAO-agent across requests. Kept as a named helper so MCP `ask_cao` and any
 * remaining CAO-only callers do not have to know about catalog lookup.
 */
export function getCaoAgent(): CaoAgent {
  return getAgent("cao");
}
