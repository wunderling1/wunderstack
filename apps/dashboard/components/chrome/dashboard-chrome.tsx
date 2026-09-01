import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/chrome/dashboard-sidebar";
import { chromeNavLinks, type ChromeNavMode, type FundNavView } from "@/lib/fund-nav";
import type { SwitcherOption } from "@/lib/switcher-options";

/** App chrome: playground-style left rail + scrolling content. */
export function DashboardChrome({
  view,
  nav,
  fundKey,
  pathname,
  switcherOptions = [],
  brandSubtitle,
  children,
}: {
  view: FundNavView;
  nav: ChromeNavMode;
  fundKey: string;
  pathname: string;
  switcherOptions?: SwitcherOption[];
  brandSubtitle: string;
  children: ReactNode;
}) {
  const links = chromeNavLinks({ view, nav, fundKey, pathname });

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <DashboardSidebar
        fundKey={fundKey}
        switcherOptions={view === "admin" ? switcherOptions : []}
        brandSubtitle={brandSubtitle}
        links={links}
      />
      <div className="min-w-0 flex-1 overflow-y-auto bg-page">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">{children}</div>
      </div>
    </div>
  );
}
