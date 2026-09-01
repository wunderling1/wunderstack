import { redirect } from "next/navigation";
import { getConversation } from "@wunderstack/analytics";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ConversationDetailView } from "@/components/fund/conversation-detail";
import { conversationPermalink, parseConversationId } from "@/lib/conversations";

export const dynamic = "force-dynamic";
export default async function ConversationPermalinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect("/login");
  const { id: raw } = await params;
  const id = parseConversationId(raw);
  if (!id) notFound();
  const item = await getConversation(tenantId, id);
  if (!item) notFound();
  // The requested id, not the conversation's first question: the shared link must keep addressing
  // the question it was shared for (A6).
  const permalink = conversationPermalink("/conversations", id);
  return (
    <ConversationDetailView
      item={item}
      permalink={permalink}
      permalinkFor={(questionId) => conversationPermalink("/conversations", questionId)}
      backHref="/conversations"
      highlightId={id}
    />
  );
}
