import { getAgent, isGroundedAgentKey, type GroundedAgent } from "@wunderstack/agents";
import { env } from "@wunderstack/shared";

/**
 * Resolve the catalog agent id for this request from tenant config (server-side).
 * The embed `data-agent` attribute is a hint only — never overrides this value.
 *
 * When `config` is null (unconfigured-open: zero active instances), the agent comes only from
 * `RUNTIME_UNCONFIGURED_AGENT` — never a silent `"cao"` guess.
 *
 * @param unconfiguredAgent Injected for tests; defaults to `env.RUNTIME_UNCONFIGURED_AGENT`.
 */
export function resolveAgentIdFromConfig(
  config: { agentKey: string } | null | undefined,
  unconfiguredAgent: string | undefined = env.RUNTIME_UNCONFIGURED_AGENT,
): string | null {
  if (config?.agentKey) {
    return config.agentKey;
  }
  if (unconfiguredAgent === undefined || unconfiguredAgent === "") {
    return null;
  }
  return unconfiguredAgent;
}

/**
 * Fail closed at process boot when RUNTIME_UNCONFIGURED_AGENT is set to an id this app cannot serve.
 * Call once from the runtime entry perimeter (chat/config routes import this module).
 *
 * The check is against the *grounded* keys, not the wider instance-key space: these routes answer
 * from a corpus with verified citations. An instance key without a runtime profile (roleplay) is a
 * boot error here rather than a request-time surprise.
 */
export function assertUnconfiguredAgentValid(
  unconfiguredAgent: string | undefined = env.RUNTIME_UNCONFIGURED_AGENT,
): void {
  if (unconfiguredAgent === undefined || unconfiguredAgent === "") {
    return;
  }
  if (!isGroundedAgentKey(unconfiguredAgent)) {
    throw new Error(
      `RUNTIME_UNCONFIGURED_AGENT=${JSON.stringify(unconfiguredAgent)} is not a registered grounded agent`,
    );
  }
}

// Validate once when this module loads (route handlers import it).
assertUnconfiguredAgentValid();

/**
 * Obtain a grounded agent instance by catalog id. Unknown ids throw — map to 4xx in the route.
 */
export function getAgentById(id: string): GroundedAgent {
  return getAgent(id);
}
