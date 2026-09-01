import {
  breakdownCountForFilter,
  getOutcomeBreakdown,
  listConversations,
  type ConversationItem,
} from "@wunderstack/analytics";
import { listInstancesCached } from "@/lib/fund-lookups";
import {
  parseConversationFilters,
  type ConversationFilters,
  type ConversationSearchParams,
} from "@/lib/conversations";
import { currentWindow } from "@/lib/period";

export interface ConversationsModel {
  filters: ConversationFilters;
  agents: string[];
  items: ConversationItem[];
  groundedTotal: number;
  exerciseTotal: number;
  breakdownCount: number | null;
}

export async function loadConversationsModel(
  fundKey: string,
  search: ConversationSearchParams,
  now = new Date(),
): Promise<ConversationsModel> {
  const instances = await listInstancesCached(fundKey);
  const agents = instances.map((instance) => instance.agentKey);
  const filters = parseConversationFilters(search, agents);
  const window = currentWindow(filters.period, now);
  const query = {
    fundKey,
    since: window.since,
    until: window.until,
    agentId: filters.agentId,
    outcome: filters.outcome,
    outcomeReason: filters.reason,
  };

  const [list, breakdown] = await Promise.all([
    listConversations(query),
    getOutcomeBreakdown({
      fundKey,
      since: window.since,
      until: window.until,
      agentId: filters.agentId,
    }),
  ]);

  return {
    filters,
    agents,
    items: list.items,
    groundedTotal: list.groundedTotal,
    exerciseTotal: list.exerciseTotal,
    breakdownCount: breakdownCountForFilter(breakdown, {
      outcome: filters.outcome,
      outcomeReason: filters.reason,
    }),
  };
}
