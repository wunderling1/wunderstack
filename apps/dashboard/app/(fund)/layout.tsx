import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { DashboardChrome } from "@/components/chrome/dashboard-chrome";
import { decideAccess } from "@/lib/authz";
import { getFundCached } from "@/lib/fund-lookups";

export default async function FundLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const decision = decideAccess(session, "fund");
  if (!decision.allow) redirect(decision.redirectTo);
  const tenantId = session?.user?.tenantId ?? "";
  const fund = await getFundCached(tenantId);
  const displayName = fund?.name ?? tenantId;
  return (
    <DashboardChrome view="fund" fundKey={tenantId} brandSubtitle={displayName}>
      {children}
    </DashboardChrome>
  );
}
