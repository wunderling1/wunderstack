import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { SignalsView } from "@/components/fund/signals";
import { loadSignalsModel } from "@/lib/signals-load";
import type { SignalsSearchParams } from "@/lib/signals";

export const dynamic = "force-dynamic";
export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<SignalsSearchParams>;
}) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect("/login");
  const [search, headerList] = await Promise.all([searchParams, headers()]);
  const pathname = headerList.get("x-pathname") ?? "/signals";
  const model = await loadSignalsModel(tenantId, search, { includeSuspicious: false });
  return (
    <SignalsView
      pathname={pathname}
      conversationsPath="/conversations"
      model={model}
      showSuspicious={false}
    />
  );
}
