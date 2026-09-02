import {
  breakdownCountForFilter,
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
  /** Questions matching the filter — the KPI unit (S22). */
  questionTotal: number;
  /** Conversations holding at least one matching question, plus exercise sessions. */
  conversationTotal: number;
  breakdownCount: number | null;
  truncated: boolean;
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

  // The breakdown comes back on the list: same window, same agent scope, same transaction. As two
  // calls it was the same rows read twice, each paying its own BEGIN + SET LOCAL + COMMIT.
  const list = await listConversations(query);

  return {
    filters,
    agents,
    items: list.items,
    questionTotal: list.questionTotal,
    // An exercise session is a container with turns, the same shape as a conversation (S22), so it
    // counts here. It carries no questions, which is why the two totals are not a sum of each other.
    conversationTotal: list.conversationTotal + list.exerciseTotal,
    breakdownCount: breakdownCountForFilter(list.breakdown, {
      outcome: filters.outcome,
      outcomeReason: filters.reason,
    }),
    truncated: list.truncated,
  };
}
