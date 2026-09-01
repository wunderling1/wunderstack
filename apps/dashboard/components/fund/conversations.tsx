import type { ConversationItem } from "@wunderstack/analytics";
import { ConversationCard } from "@/components/fund/conversation-cards";
import { ConversationFiltersForm } from "@/components/fund/conversation-filters";
import { ScanTruncationNote } from "@/components/fund/measurement-note";
import { conversationPermalink, type ConversationFilters } from "@/lib/conversations";
import { formatCount } from "@/lib/overview";

export function ConversationsView({
  pathname,
  listPath,
  filters,
  agents,
  items,
  questionTotal,
  conversationTotal,
  breakdownCount,
  truncated,
}: {
  pathname: string;
  listPath: string;
  filters: ConversationFilters;
  agents: readonly string[];
  items: ConversationItem[];
  questionTotal: number;
  conversationTotal: number;
  breakdownCount: number | null;
  truncated: boolean;
}) {
  const permalinkFor = (id: string) => conversationPermalink(listPath, id);
  const groundedItems = items.filter((item) => item.kind === "grounded");
  const exerciseItems = items.filter((item) => item.kind === "exercise");

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
        {/* Two units, both true (S22): the filter selects questions, the list shows the
            conversations that hold them. */}
        <p className="text-text">
          {formatCount(questionTotal)} {questionTotal === 1 ? "vraag" : "vragen"} in{" "}
          {formatCount(conversationTotal)}{" "}
          {conversationTotal === 1 ? "gesprek" : "gesprekken"}
          {items.length < conversationTotal
            ? ` · toont de laatste ${formatCount(items.length)}`
            : null}
        </p>
        {breakdownCount !== null ? (
          <p className="text-text-muted">
            Overzicht telt {formatCount(breakdownCount)} vragen voor dit filter
            {breakdownCount === questionTotal
              ? " — zelfde telling."
              : ` — lijst telt ${formatCount(questionTotal)}.`}
          </p>
        ) : null}
      </div>
      {truncated ? <ScanTruncationNote /> : null}

      {items.length === 0 ? (
        <p className="text-sm text-text-subtle">Geen gesprekken in deze selectie.</p>
      ) : (
        <>
          {groundedItems.length > 0 ? (
            <ConversationSection title="Gesprekken" items={groundedItems} permalinkFor={permalinkFor} />
          ) : null}
          {exerciseItems.length > 0 ? (
            <ConversationSection
              title="Oefensessies"
              items={exerciseItems}
              permalinkFor={permalinkFor}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function ConversationSection({
  title,
  items,
  permalinkFor,
}: {
  title: string;
  items: ConversationItem[];
  permalinkFor: (id: string) => string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <ConversationCard item={item} permalinkFor={permalinkFor} />
          </li>
        ))}
      </ul>
    </section>
  );
}
