import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { TopBar } from "@/components/top-bar";
import { decideAccess } from "@/lib/authz";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const decision = decideAccess(session, "admin");
  if (!decision.allow) redirect(decision.redirectTo);

  return (
    <div className="min-h-dvh">
      <TopBar title="Wunderling — beheer" subtitle={session?.user?.email ?? undefined} />
      <div className="mx-auto w-full max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
