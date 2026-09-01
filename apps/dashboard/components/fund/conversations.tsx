import { CONVERSATION_LIST_LIMIT, type ConversationItem } from "@wunderstack/analytics";
import { ConversationCard } from "@/components/fund/conversation-cards";
import { ConversationFiltersForm } from "@/components/fund/conversation-filters";
import { conversationPermalink, type ConversationFilters } from "@/lib/conversations";
import { formatCount } from "@/lib/overview";

export function ConversationsView({
  pathname,
  listPath,
  filters,
  agents,
  items,
  groundedTotal,
  exerciseTotal,
  breakdownCount,
}: {
  pathname: string;
  listPath: string;
  filters: ConversationFilters;
  agents: readonly string[];
  items: ConversationItem[];
  groundedTotal: number;
  exerciseTotal: number;
  breakdownCount: number | null;
}) {
  const total = groundedTotal + exerciseTotal;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-text">Gesprekken</h2>
        <p className="mt-1 text-sm text-text-muted">
          Fondsbreed overzicht. Filters staan in de URL zodat een selectie deelbaar is.
        </p>
      </div>

      <ConversationFiltersForm pathname={pathname} filters={filters} agents={agents} />

      <div className="flex flex-col gap-1 text-sm">
        <p className="text-text">
          {formatCount(total)} {total === 1 ? "gesprek" : "gesprekken"}
          {items.length < total
            ? ` · toont de laatste ${formatCount(Math.min(items.length, CONVERSATION_LIST_LIMIT))}`
            : null}
        </p>
        {breakdownCount !== null ? (
          <p className="text-text-muted">
            Overzicht telt {formatCount(breakdownCount)} voor dit filter
            {breakdownCount === groundedTotal
              ? " — zelfde telling."
              : ` — lijst telt ${formatCount(groundedTotal)}.`}
          </p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-text-subtle">Geen gesprekken in deze selectie.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <ConversationCard item={item} permalink={conversationPermalink(listPath, item.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
