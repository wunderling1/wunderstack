import { z } from "zod";

import { createGroundedAgent } from "./runtime/create-agent.js";
import {
  listAgentProfiles,
  resolveRegisteredProfile,
} from "./runtime/registry.js";
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
  return listAgentProfiles().map((profile) => ({
    id: profile.agentKey,
    label: profile.label,
    description: profile.description,
  }));
}

/** Resolve an agent by id; throws when unknown. */
export function getAgent(id: string): GroundedAgent {
  const profile = resolveRegisteredProfile(id);
  if (!profile) {
    throw new Error(`Unknown agent: ${id}`);
  }

  const cached = cachedAgents.get(id);
  if (cached) {
    return cached;
  }

  const instance = createGroundedAgent(profile);
  cachedAgents.set(id, instance);
  return instance;
}

/** @internal Reset cached agent instances (tests only). */
export function resetAgentCache(): void {
  cachedAgents = new Map();
}
