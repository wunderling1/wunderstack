import type { AgentKey } from "@wunderstack/shared";
import { parsePeriod, type PeriodId } from "./period";

export interface SignalsFilters {
  period: PeriodId;
  agentId?: AgentKey;
}

export interface SignalsSearchParams {
  period?: string | string[];
  agent?: string | string[];
}

function first(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

function parseAgent(raw: string | undefined, allowed: readonly string[]): AgentKey | undefined {
  if (raw === undefined) return undefined;
  return allowed.includes(raw) ? (raw as AgentKey) : undefined;
}

/** URL searchparams → Signalen filters. No client state. */
export function parseSignalsFilters(
  search: SignalsSearchParams,
  allowedAgents: readonly string[],
): SignalsFilters {
  return {
    period: parsePeriod(search.period),
    agentId: parseAgent(first(search.agent), allowedAgents),
  };
}

export function signalsFilterExtras(filters: SignalsFilters): Record<string, string | undefined> {
  return { agent: filters.agentId };
}
