import { z } from "zod";

/**
 * Canonical agent-key vocabulary. Shared has no workspace deps and is imported by db, agents, and
 * dashboard — the only place all three can share without a cycle or a cruiser violation.
 * Adding an agent: extend AGENT_KEYS here first; AGENT_PROFILES in packages/agents must then
 * `satisfies Record<AgentKey, …>` or TypeScript fails.
 */
export const AGENT_KEYS = ["cao", "arbo"] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

export const agentKeySchema = z.enum(AGENT_KEYS);

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value);
}

/** Dutch UI labels for admin surfaces (dashboard). Not used in code identifiers. */
export const AGENT_KEY_LABELS: Record<AgentKey, string> = {
  cao: "CAO-agent",
  arbo: "Arbocatalogus-agent",
};
