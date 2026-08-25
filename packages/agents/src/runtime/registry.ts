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

export function isAgentKey(value: string): value is AgentKey {
  return Object.prototype.hasOwnProperty.call(AGENT_PROFILES, value);
}

export function listAgentProfiles(): AgentRuntimeProfile[] {
  return Object.values(AGENT_PROFILES);
}

export function requireAgentProfile(key: AgentKey): AgentRuntimeProfile {
  return AGENT_PROFILES[key];
}
