import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { DashboardChrome } from "@/components/chrome/dashboard-chrome";
import { decideAccess } from "@/lib/authz";

export default async function FundLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const decision = decideAccess(session, "fund");
  if (!decision.allow) redirect(decision.redirectTo);
  const tenantId = session?.user?.tenantId ?? "";
  return (
    <DashboardChrome view="fund" fundKey={tenantId}>
      {children}
    </DashboardChrome>
  );
}
