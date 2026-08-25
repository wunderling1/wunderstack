import { arboProfile } from "../arbo/profile.js";
import { caoProfile } from "../cao/profile.js";
import type { AgentRuntimeProfile } from "./profile.js";

/**
 * Single source of registered grounded-agent profiles. Catalog, eval profiles, and hard-fact keys
 * must all derive from this list — adding an agent without updating the dependents is a type error.
 */
export const AGENT_PROFILES = {
  cao: caoProfile,
  arbo: arboProfile,
} as const satisfies Record<string, AgentRuntimeProfile>;

export type AgentKey = keyof typeof AGENT_PROFILES;

/** Test-only profiles (agent-3 fixture). Never used in production. */
const testProfiles = new Map<string, AgentRuntimeProfile>();

export function isAgentKey(value: string): value is AgentKey {
  return Object.prototype.hasOwnProperty.call(AGENT_PROFILES, value);
}

export function resolveRegisteredProfile(id: string): AgentRuntimeProfile | undefined {
  if (isAgentKey(id)) {
    return AGENT_PROFILES[id];
  }
  return testProfiles.get(id);
}

export function listAgentProfiles(): AgentRuntimeProfile[] {
  return [...Object.values(AGENT_PROFILES), ...testProfiles.values()];
}

export function requireAgentProfile(key: AgentKey): AgentRuntimeProfile {
  return AGENT_PROFILES[key];
}

/**
 * @internal Register a fixture profile for tests (agent-3 proof). Returns an unregister function.
 * Production code must not call this.
 */
export function registerTestAgentProfile(profile: AgentRuntimeProfile): () => void {
  testProfiles.set(profile.agentKey, profile);
  return () => {
    testProfiles.delete(profile.agentKey);
  };
}
