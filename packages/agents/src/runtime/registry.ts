import {
  isGroundedAgentKey as sharedIsGroundedAgentKey,
  type GroundedAgentKey,
} from "@wunderstack/shared";
import { arboProfile } from "../arbo/profile.js";
import { caoProfile } from "../cao/profile.js";
import type { AgentRuntimeProfile } from "./profile.js";

export type { GroundedAgentKey };

/**
 * @deprecated Use {@link GroundedAgentKey}. Kept so `src/evals/agent-profile.ts` compiles unchanged —
 * 700-evals.mdc forbids touching `src/evals/` as a side effect of unrelated work. Not re-exported
 * from the package barrel, so no consumer outside this package sees two meanings of `AgentKey`
 * (in @wunderstack/shared it is the wider instance-key space; see DECISION-roleplay-agent.md R1).
 */
export type AgentKey = GroundedAgentKey;

/**
 * Single source of registered grounded-agent profiles. Catalog, eval profiles, and hard-fact keys
 * must all derive from this list — adding an agent without updating GROUNDED_AGENT_KEYS in
 * @wunderstack/shared is a type error (`satisfies Record<GroundedAgentKey, …>`).
 *
 * Agents that answer without retrieval (roleplay) are instance keys, not profiles: they live in
 * AGENT_KEYS but deliberately never reach this record.
 */
export const AGENT_PROFILES = {
  cao: caoProfile,
  arbo: arboProfile,
} as const satisfies Record<GroundedAgentKey, AgentRuntimeProfile>;

/** Test-only profiles (agent-3 fixture). Never used in production. */
const testProfiles = new Map<string, AgentRuntimeProfile>();

export function isGroundedAgentKey(value: string): value is GroundedAgentKey {
  return sharedIsGroundedAgentKey(value);
}

export function resolveRegisteredProfile(id: string): AgentRuntimeProfile | undefined {
  if (isGroundedAgentKey(id)) {
    return AGENT_PROFILES[id];
  }
  return testProfiles.get(id);
}

export function listAgentProfiles(): AgentRuntimeProfile[] {
  return [...Object.values(AGENT_PROFILES), ...testProfiles.values()];
}

export function requireAgentProfile(key: GroundedAgentKey): AgentRuntimeProfile {
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
