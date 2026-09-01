import { headers } from "next/headers";
import { auth } from "@/auth";
import { SignalsView } from "@/components/fund/signals";
import { loadSignalsModel } from "@/lib/signals-load";
import type { SignalsSearchParams } from "@/lib/signals";

export const dynamic = "force-dynamic";

export default async function SignalenPage({
  searchParams,
}: {
  searchParams: Promise<SignalsSearchParams>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return null;

  const [search, headerList] = await Promise.all([searchParams, headers()]);
  const pathname = headerList.get("x-pathname") ?? "/signalen";
  const model = await loadSignalsModel(tenantId, search, { includeSuspicious: false });

  return (
    <SignalsView
      pathname={pathname}
      gesprekkenPath="/gesprekken"
      model={model}
      showSuspicious={false}
    />
  );
}
