import { getConversation } from "@wunderstack/analytics";
import { notFound } from "next/navigation";
import { ConversationDetailView } from "@/components/fund/conversation-detail";
import { conversationPermalink, parseConversationId } from "@/lib/conversations";
import { parseFundKey } from "@/lib/route-params";

export const dynamic = "force-dynamic";

export default async function AdminGesprekPermalinkPage({
  params,
}: {
  params: Promise<{ fundKey: string; id: string }>;
}) {
  const { fundKey: rawFund, id: rawId } = await params;
  const fundKey = parseFundKey(rawFund);
  const id = parseConversationId(rawId);
  if (!fundKey || !id) notFound();

  const item = await getConversation(fundKey, id);
  if (!item) notFound();

  const listPath = `/admin/funds/${fundKey}/gesprekken`;
  return (
    <ConversationDetailView
      item={item}
      // The requested id, not the conversation's first question (A6).
      permalink={conversationPermalink(listPath, id)}
      permalinkFor={(questionId) => conversationPermalink(listPath, questionId)}
      backHref={listPath}
      highlightId={id}
    />
  );
}
