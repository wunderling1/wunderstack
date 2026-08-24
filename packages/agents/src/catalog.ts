import { z } from "zod";

import { createGroundedAgent } from "./runtime/create-agent.js";
import { AGENT_PROFILES, isAgentKey, type AgentKey } from "./runtime/registry.js";
import type { GroundedAgent } from "./types.js";

/**
 * Agent catalog — control-plane listing derived from {@link AGENT_PROFILES}.
 * Apps list agents via `listAgents()` and obtain a runtime instance via `getAgent(id)`.
 */

export const agentDescriptorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

export type AgentDescriptor = z.infer<typeof agentDescriptorSchema>;

let cachedAgents = new Map<string, GroundedAgent>();

/** List all agents available in the catalog. */
export function listAgents(): AgentDescriptor[] {
  return Object.values(AGENT_PROFILES).map((profile) => ({
    id: profile.agentKey,
    label: profile.label,
    description: profile.description,
  }));
}

/** Resolve an agent by id; throws when unknown. */
export function getAgent(id: string): GroundedAgent {
  if (!isAgentKey(id)) {
    throw new Error(`Unknown agent: ${id}`);
  }
  const key: AgentKey = id;

  const cached = cachedAgents.get(key);
  if (cached) {
    return cached;
  }

  const instance = createGroundedAgent(AGENT_PROFILES[key]);
  cachedAgents.set(key, instance);
  return instance;
}

/** @internal Reset cached agent instances (tests only). */
export function resetAgentCache(): void {
  cachedAgents = new Map();
}
