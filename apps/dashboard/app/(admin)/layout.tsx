import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { DashboardChrome } from "@/components/chrome/dashboard-chrome";
import { decideAccess } from "@/lib/authz";
import { getFundCached, listActiveFundOptionsCached } from "@/lib/fund-lookups";
import { parseAdminChromePath } from "@/lib/fund-nav";
import { buildSwitcherOptions } from "@/lib/switcher-options";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const decision = decideAccess(session, "admin");
  if (!decision.allow) redirect(decision.redirectTo);

  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "/admin";
  const chrome = parseAdminChromePath(pathname);

  const activeFunds = await listActiveFundOptionsCached();
  const switcherFunds = [...activeFunds];
  if (chrome.fundKey && !switcherFunds.some((row) => row.key === chrome.fundKey)) {
    const fund = await getFundCached(chrome.fundKey);
    if (fund) {
      switcherFunds.unshift({ key: fund.key, name: fund.name ?? fund.key });
    }
  }

  const switcherOptions = buildSwitcherOptions(session ?? {}, switcherFunds);

  return (
    <DashboardChrome
      view="admin"
      nav={chrome.nav}
      fundKey={chrome.switcherKey}
      pathname={pathname}
      switcherOptions={switcherOptions}
      brandSubtitle="Beheer"
    >
      {children}
    </DashboardChrome>
  );
}
