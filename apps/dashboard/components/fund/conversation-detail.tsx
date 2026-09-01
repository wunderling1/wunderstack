import type { ConversationItem } from "@wunderstack/analytics";
import Link from "next/link";
import { ConversationCard } from "@/components/fund/conversation-cards";

export function ConversationDetailView({
  item,
  permalink,
  backHref,
}: {
  item: ConversationItem;
  permalink: string;
  backHref: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm">
          <Link href={backHref} className="text-primary hover:underline">
            ← Gesprekken
          </Link>
        </p>
        <h2 className="mt-2 font-display text-lg font-semibold text-text">Gesprek</h2>
        <p className="mt-1 break-all font-mono text-xs text-text-muted">{permalink}</p>
      </div>
      <ConversationCard item={item} permalink={permalink} />
    </div>
  );
}
