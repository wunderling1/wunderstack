import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SignalsView } from "@/components/fund/signals";
import { loadSignalsModel } from "@/lib/signals-load";
import type { SignalsSearchParams } from "@/lib/signals";
import { parseFundKey } from "@/lib/route-params";

export const dynamic = "force-dynamic";

export default async function AdminSignalenPage({
  params,
  searchParams,
}: {
  params: Promise<{ fundKey: string }>;
  searchParams: Promise<SignalsSearchParams>;
}) {
  const [{ fundKey: raw }, search, headerList] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  const fundKey = parseFundKey(raw);
  if (!fundKey) notFound();

  const pathname = headerList.get("x-pathname") ?? `/admin/funds/${fundKey}/signalen`;
  const model = await loadSignalsModel(fundKey, search, { includeSuspicious: true });

  return (
    <SignalsView
      pathname={pathname}
      gesprekkenPath={`/admin/funds/${fundKey}/gesprekken`}
      model={model}
      showSuspicious
    />
  );
}
