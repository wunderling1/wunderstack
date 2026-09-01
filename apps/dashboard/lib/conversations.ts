import {
  refusedReasons,
  turnOutcomes,
  type AgentKey,
  type RefusedReason,
  type TurnOutcomeValue,
} from "@wunderstack/shared";
import { parsePeriod, type PeriodId } from "./period";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OUTCOME_LABELS: Record<TurnOutcomeValue, string> = {
  answered: "Beantwoord",
  refused: "Geweigerd",
  clarified: "Verduidelijkt",
  error: "Fout",
  unknown: "Onbekend",
};

export const REASON_LABELS: Record<string, string> = {
  grounded: "Gegrond",
  no_coverage: "Geen dekking",
  guard_hard_fact: "Harde feit-guard",
  guard_citation_coupling: "Citatiekoppeling",
  out_of_scope: "Buiten scope",
  ambiguous_query: "Vraag onduidelijk",
  timeout: "Timeout",
  provider_error: "Providerfout",
  aborted: "Afgebroken",
};

export const EXERCISE_END_LABELS: Record<string, string> = {
  completed: "Afgerond",
  max_turns_reached: "Afgerond (beurten op)",
  abandoned: "Afgebroken",
};

export interface ConversationFilters {
  period: PeriodId;
  agentId?: AgentKey;
  outcome?: TurnOutcomeValue;
  reason?: RefusedReason;
}

export interface ConversationSearchParams {
  period?: string | string[];
  agent?: string | string[];
  outcome?: string | string[];
  reason?: string | string[];
}

function first(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

function parseOutcome(raw: string | undefined): TurnOutcomeValue | undefined {
  if (raw === undefined) return undefined;
  return (turnOutcomes as readonly string[]).includes(raw)
    ? (raw as TurnOutcomeValue)
    : undefined;
}

function parseReason(raw: string | undefined): RefusedReason | undefined {
  if (raw === undefined) return undefined;
  return (refusedReasons as readonly string[]).includes(raw)
    ? (raw as RefusedReason)
    : undefined;
}

function parseAgent(raw: string | undefined, allowed: readonly string[]): AgentKey | undefined {
  if (raw === undefined) return undefined;
  return allowed.includes(raw) ? (raw as AgentKey) : undefined;
}

/** URL searchparams → list filters. Reason implies refused when outcome is unset. */
export function parseConversationFilters(
  search: ConversationSearchParams,
  allowedAgents: readonly string[],
): ConversationFilters {
  const period = parsePeriod(search.period);
  const agentId = parseAgent(first(search.agent), allowedAgents);
  let outcome = parseOutcome(first(search.outcome));
  let reason = parseReason(first(search.reason));
  if (reason !== undefined && outcome === undefined) {
    outcome = "refused";
  }
  if (reason !== undefined && outcome !== undefined && outcome !== "refused") {
    reason = undefined;
  }
  return { period, agentId, outcome, reason };
}

export function conversationFilterExtras(filters: ConversationFilters): Record<string, string | undefined> {
  return {
    agent: filters.agentId,
    outcome: filters.outcome,
    reason: filters.reason,
  };
}

export function conversationListHref(
  pathname: string,
  filters: ConversationFilters,
): string {
  const params = new URLSearchParams();
  params.set("period", filters.period);
  if (filters.agentId) params.set("agent", filters.agentId);
  if (filters.outcome) params.set("outcome", filters.outcome);
  if (filters.reason) params.set("reason", filters.reason);
  return `${pathname}?${params.toString()}`;
}

/** Stable shareable permalink — id only, no list filters, no session cookie. */
export function conversationPermalink(listPath: string, id: string): string {
  const base = listPath.endsWith("/") ? listPath.slice(0, -1) : listPath;
  return `${base}/${id}`;
}

export function parseConversationId(raw: string): string | null {
  return UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

export function outcomeChipVariant(
  outcome: string,
): "verified" | "caution" | "refusal" | "danger" {
  if (outcome === "answered") return "verified";
  if (outcome === "clarified" || outcome === "unknown") return "caution";
  if (outcome === "error") return "danger";
  return "refusal";
}

export function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome as TurnOutcomeValue] ?? outcome;
}

export function reasonLabel(reason: string | null): string | null {
  if (reason === null || reason === "") return null;
  return REASON_LABELS[reason] ?? reason;
}

export function exerciseStatusLabel(
  status: string,
  endReason: string | null,
): string {
  const label = endReason === null ? undefined : EXERCISE_END_LABELS[endReason];
  if (label !== undefined) return label;
  return status === "active" ? "Bezig" : "Beëindigd";
}

export const FILTER_OUTCOMES = turnOutcomes;

export const FILTER_REASONS = refusedReasons;
