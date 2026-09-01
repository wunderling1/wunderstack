import { getConversation } from "@wunderstack/analytics";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ConversationDetailView } from "@/components/fund/conversation-detail";
import { conversationPermalink, parseConversationId } from "@/lib/conversations";

export const dynamic = "force-dynamic";

export default async function GesprekPermalinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return null;

  const { id: raw } = await params;
  const id = parseConversationId(raw);
  if (!id) notFound();

  const item = await getConversation(tenantId, id);
  if (!item) notFound();

  const permalink = conversationPermalink("/gesprekken", item.id);
  return <ConversationDetailView item={item} permalink={permalink} backHref="/gesprekken" />;
}
