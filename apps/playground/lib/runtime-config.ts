/**
 * Fetch public tenant config from the runtime (server-side). Playground uses this for status labels
 * and agent identity without importing agent packages (no-playground-to-agents).
 */
import { tenantPublicConfigSchema, type TenantPublicConfig } from "@wunderstack/shared/browser";

const RUNTIME_URL = process.env.RUNTIME_URL ?? "http://localhost:3000";

export type PlaygroundAgent = "cao" | "arbo";

function tenantKeyFor(agent: PlaygroundAgent): string | undefined {
  if (agent === "arbo") {
    return process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO?.trim();
  }
  return process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY?.trim();
}

export async function fetchTenantPublicConfig(agent: PlaygroundAgent): Promise<TenantPublicConfig | null> {
  const key = tenantKeyFor(agent);
  if (!key) return null;
  try {
    const res = await fetch(`${RUNTIME_URL}/api/config`, {
      headers: { "x-wunderstack-key": key },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return tenantPublicConfigSchema.parse(await res.json());
  } catch {
    return null;
  }
}

export interface PlaygroundAgentOption {
  id: PlaygroundAgent;
  label: string;
  kind: string;
  initials: string;
}

export const PLAYGROUND_AGENT_BY_ID: Record<PlaygroundAgent, PlaygroundAgentOption> = {
  cao: { id: "cao", label: "CAO-assistent", kind: "Kennisagent", initials: "CA" },
  arbo: { id: "arbo", label: "Arbocatalogus", kind: "Kennisagent", initials: "AR" },
};

export const PLAYGROUND_AGENTS: PlaygroundAgentOption[] = [
  PLAYGROUND_AGENT_BY_ID.cao,
  PLAYGROUND_AGENT_BY_ID.arbo,
];
