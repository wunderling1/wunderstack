import { headers } from "next/headers";
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
  const [fund, headerList] = await Promise.all([getFundCached(tenantId), headers()]);
  const pathname = headerList.get("x-pathname") ?? "/";
  const displayName = fund?.name ?? tenantId;

  return (
    <DashboardChrome
      view="fund"
      nav="fund"
      fundKey={tenantId}
      pathname={pathname}
      brandSubtitle={displayName}
    >
      {children}
    </DashboardChrome>
  );
}
