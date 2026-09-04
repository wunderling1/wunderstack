import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/chrome/dashboard-sidebar";
import type { FundNavView } from "@/lib/fund-nav";
import type { SwitcherOption } from "@/lib/switcher-options";

/** App chrome: playground-style left rail + scrolling content. */
export function DashboardChrome({
  view,
  fundKey,
  switcherOptions = [],
  children,
}: {
  view: FundNavView;
  fundKey: string;
  switcherOptions?: SwitcherOption[];
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <DashboardSidebar
        view={view}
        fundKey={fundKey}
        switcherOptions={view === "admin" ? switcherOptions : []}
      />
      <div className="min-w-0 flex-1 overflow-y-auto bg-page">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">{children}</div>
      </div>
    </div>
  );
}
