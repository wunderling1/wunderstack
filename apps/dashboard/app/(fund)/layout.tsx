import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { FundAreaTabNav } from "@/components/fund/area-tab-nav";
import { TopBar } from "@/components/top-bar";
import { decideAccess } from "@/lib/authz";

export default async function FundLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const decision = decideAccess(session, "fund");
  if (!decision.allow) redirect(decision.redirectTo);

  const tenantId = session?.user?.tenantId ?? "";
  return (
    <div className="min-h-dvh">
      <TopBar title="Fondsdashboard" subtitle={`Fonds: ${tenantId}`} />
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <FundAreaTabNav />
        {children}
      </div>
    </div>
  );
}
