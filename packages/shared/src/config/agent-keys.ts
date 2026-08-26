import { z } from "zod";

/**
 * Canonical agent-key vocabulary, in two layers. Shared has no workspace deps and is imported by db,
 * agents, and dashboard — the only place all three can share without a cycle or a cruiser violation.
 *
 * AGENT_KEYS is every agent that can exist as an instance on a fund: the key in
 * `control.agent_instances`, in tracing, and in analytics. GROUNDED_AGENT_KEYS is the subset that
 * answers questions from a corpus through `createGroundedAgent`; only those carry an
 * `AgentRuntimeProfile`. The roleplay agent is an instance but not a grounded agent — it retrieves
 * nothing and cites nothing, so a single flat list would force it to declare a `runRetrieval` it has
 * no use for (docs/decisions/DECISION-roleplay-agent.md, R1).
 *
 * Adding a grounded agent: extend GROUNDED_AGENT_KEYS here first; AGENT_PROFILES in packages/agents
 * must then `satisfies Record<GroundedAgentKey, …>` or TypeScript fails.
 */
export const AGENT_KEYS = ["cao", "arbo", "roleplay"] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

export const agentKeySchema = z.enum(AGENT_KEYS);

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value);
}

/**
 * Agents served by the grounded pipeline. `satisfies readonly AgentKey[]` makes the subset relation
 * a compile error to break, so this list can never drift away from AGENT_KEYS.
 */
export const GROUNDED_AGENT_KEYS = ["cao", "arbo"] as const satisfies readonly AgentKey[];

export type GroundedAgentKey = (typeof GROUNDED_AGENT_KEYS)[number];

export const groundedAgentKeySchema = z.enum(GROUNDED_AGENT_KEYS);

export function isGroundedAgentKey(value: string): value is GroundedAgentKey {
  return (GROUNDED_AGENT_KEYS as readonly string[]).includes(value);
}

/** Dutch UI labels for admin surfaces (dashboard). Not used in code identifiers. */
export const AGENT_KEY_LABELS: Record<AgentKey, string> = {
  cao: "CAO-agent",
  arbo: "Arbocatalogus-agent",
  roleplay: "Rollenspelagent",
};
