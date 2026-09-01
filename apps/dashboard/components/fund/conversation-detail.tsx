import type { ConversationItem } from "@wunderstack/analytics";
import Link from "next/link";
import { ConversationCard } from "@/components/fund/conversation-cards";
import { ConversationHighlightScroll } from "@/components/fund/conversation-highlight-scroll";

export function ConversationDetailView({
  item,
  permalink,
  permalinkFor,
  backHref,
  highlightId,
}: {
  item: ConversationItem;
  permalink: string;
  permalinkFor: (id: string) => string;
  backHref: string;
  /** The question this permalink was shared for. */
  highlightId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ConversationHighlightScroll highlightId={highlightId} />
      <div>
        <p className="text-sm">
          <Link href={backHref} className="text-primary hover:underline">
            ← Gesprekken
          </Link>
        </p>
        <h2 className="mt-2 font-display text-lg font-semibold text-text">
          {item.kind === "exercise" ? "Oefensessie" : "Gesprek"}
        </h2>
        <p className="mt-1 break-all font-mono text-xs text-text-muted">{permalink}</p>
      </div>
      {/* Expanded: a permalink shows the whole conversation, not a capped preview of it. The
          question it was shared for is marked, so the link lands on it and not merely near it. */}
      <ConversationCard
        item={item}
        permalinkFor={permalinkFor}
        expanded
        highlightId={highlightId}
      />
    </div>
  );
}
