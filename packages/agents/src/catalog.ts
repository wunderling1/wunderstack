import { z } from "zod";

import { createCaoAgent } from "./cao/agent.js";
import { createArboAgent } from "./arbo/agent.js";
import type { GroundedAgent } from "./types.js";

/**
 * Agent catalog — control-plane registry of available agents.
 * Apps list agents via `listAgents()` and obtain a runtime instance via `getAgent(id)`.
 */

export const agentDescriptorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

export type AgentDescriptor = z.infer<typeof agentDescriptorSchema>;

const AGENT_CATALOG: AgentDescriptor[] = [
  {
    id: "cao",
    label: "CAO-agent",
    description: "Antwoorden met bronvermelding uit CAO-teksten",
  },
  {
    id: "arbo",
    label: "Arbocatalogus-agent",
    description: "Antwoorden met bronvermelding uit de sectorale arbocatalogus",
  },
];

const agentFactories: Record<string, () => GroundedAgent> = {
  cao: createCaoAgent,
  arbo: createArboAgent,
};

let cachedAgents = new Map<string, GroundedAgent>();

/** List all agents available in the catalog. */
export function listAgents(): AgentDescriptor[] {
  return [...AGENT_CATALOG];
}

/** Resolve an agent by id; throws when unknown. */
export function getAgent(id: string): GroundedAgent {
  const descriptor = AGENT_CATALOG.find((entry) => entry.id === id);
  if (!descriptor) {
    throw new Error(`Unknown agent: ${id}`);
  }

  const cached = cachedAgents.get(id);
  if (cached) {
    return cached;
  }

  const factory = agentFactories[id];
  if (!factory) {
    throw new Error(`No factory registered for agent: ${id}`);
  }

  const instance = factory();
  cachedAgents.set(id, instance);
  return instance;
}

/** @internal Reset cached agent instances (tests only). */
export function resetAgentCache(): void {
  cachedAgents = new Map();
}
