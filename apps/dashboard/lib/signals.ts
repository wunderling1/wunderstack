import type { AgentKey } from "@wunderstack/shared";
import { parsePeriod, type PeriodId } from "./period";

export interface SignalsFilters {
  period: PeriodId;
  agentId?: AgentKey;
  /** 1-based page for the knowledge-gap list. */
  page: number;
}

export interface SignalsSearchParams {
  period?: string | string[];
  agent?: string | string[];
  page?: string | string[];
}

function first(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

function parseAgent(raw: string | undefined, allowed: readonly string[]): AgentKey | undefined {
  if (raw === undefined) return undefined;
  return allowed.includes(raw) ? (raw as AgentKey) : undefined;
}

function parsePage(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return 1;
  return value;
}

/** URL searchparams → Signalen filters. No client state. */
export function parseSignalsFilters(
  search: SignalsSearchParams,
  allowedAgents: readonly string[],
): SignalsFilters {
  return {
    period: parsePeriod(search.period),
    agentId: parseAgent(first(search.agent), allowedAgents),
    page: parsePage(first(search.page)),
  };
}

export function signalsFilterExtras(filters: SignalsFilters): Record<string, string | undefined> {
  return {
    agent: filters.agentId,
    page: filters.page > 1 ? String(filters.page) : undefined,
  };
}
