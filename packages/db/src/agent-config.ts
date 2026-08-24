import { agentConfigDataSchema } from "@wunderstack/shared";
import { and, eq } from "drizzle-orm";

import { getDb } from "./client.js";
import { agentConfig, type AgentConfig } from "./schema/control/agent-config.js";

/** Read per-fund agent tuning knobs from `agent_config.config` jsonb. */
export async function getAgentConfig(agentKey: string, fundKey: string): Promise<AgentConfig | null> {
  const [row] = await getDb()
    .select()
    .from(agentConfig)
    .where(and(eq(agentConfig.agentKey, agentKey), eq(agentConfig.fundKey, fundKey)))
    .limit(1);
  return row ?? null;
}

/** Parsed agent_config knobs — invalid jsonb is ignored (empty object). */
export function parseAgentConfigData(config: Record<string, unknown> | null | undefined) {
  const parsed = agentConfigDataSchema.safeParse(config ?? {});
  return parsed.success ? parsed.data : {};
}
