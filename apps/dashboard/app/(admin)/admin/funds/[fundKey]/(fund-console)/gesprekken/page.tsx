import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ConversationsView } from "@/components/fund/conversations";
import { loadConversationsModel } from "@/lib/conversations-load";
import type { ConversationSearchParams } from "@/lib/conversations";
import { parseFundKey } from "@/lib/route-params";

export const dynamic = "force-dynamic";

export default async function AdminGesprekkenPage({
  params,
  searchParams,
}: {
  params: Promise<{ fundKey: string }>;
  searchParams: Promise<ConversationSearchParams>;
}) {
  const [{ fundKey: raw }, search, headerList] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const fundKey = parseFundKey(raw);
  if (!fundKey) notFound();

  const listPath = `/admin/funds/${fundKey}/gesprekken`;
  const pathname = headerList.get("x-pathname") ?? listPath;
  const model = await loadConversationsModel(fundKey, search);

  return (
    <ConversationsView
      pathname={pathname}
      listPath={listPath}
      filters={model.filters}
      agents={model.agents}
      items={model.items}
      groundedTotal={model.groundedTotal}
      exerciseTotal={model.exerciseTotal}
      breakdownCount={model.breakdownCount}
    />
  );
}
