import { headers } from "next/headers";
import { auth } from "@/auth";
import { ConversationsView } from "@/components/fund/conversations";
import { loadConversationsModel } from "@/lib/conversations-load";
import type { ConversationSearchParams } from "@/lib/conversations";

export const dynamic = "force-dynamic";

export default async function GesprekkenPage({
  searchParams,
}: {
  searchParams: Promise<ConversationSearchParams>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return null;

  const [search, headerList] = await Promise.all([searchParams, headers()]);
  const pathname = headerList.get("x-pathname") ?? "/gesprekken";
  const model = await loadConversationsModel(tenantId, search);

  return (
    <ConversationsView
      pathname={pathname}
      listPath="/gesprekken"
      filters={model.filters}
      agents={model.agents}
      items={model.items}
      groundedTotal={model.groundedTotal}
      exerciseTotal={model.exerciseTotal}
      breakdownCount={model.breakdownCount}
    />
  );
}
