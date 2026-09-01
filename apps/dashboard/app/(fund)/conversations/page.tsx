import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { ConversationsView } from "@/components/fund/conversations";
import { loadConversationsModel } from "@/lib/conversations-load";
import type { ConversationSearchParams } from "@/lib/conversations";

export const dynamic = "force-dynamic";
export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<ConversationSearchParams>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect("/login");
  const [search, headerList] = await Promise.all([searchParams, headers()]);
  const pathname = headerList.get("x-pathname") ?? "/conversations";
  const model = await loadConversationsModel(tenantId, search);
  return (
    <ConversationsView
      pathname={pathname}
      listPath="/conversations"
      filters={model.filters}
      agents={model.agents}
      items={model.items}
      questionTotal={model.questionTotal}
      conversationTotal={model.conversationTotal}
      breakdownCount={model.breakdownCount}
      truncated={model.truncated}
    />
  );
}
