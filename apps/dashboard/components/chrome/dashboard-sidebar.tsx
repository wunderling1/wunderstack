"use client";

import {
  Activity,
  Bot,
  Building2,
  Button,
  ChartLine,
  cn,
  Dialog,
  DialogContent,
  DialogTitle,
  Icon,
  Menu,
  MessageCircle,
  Settings,
  type LucideIcon,
} from "@wunderstack/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { FundSwitcher } from "@/components/fund/fund-switcher";
import { SignOutForm } from "@/components/chrome/sign-out-form";
import {
  chromeNavLinks,
  parseAdminChromePath,
  type FundNavView,
} from "@/lib/fund-nav";
import type { SwitcherOption } from "@/lib/switcher-options";

/** Nav icons keyed by href — label copy can change without dropping the icon. */
const NAV_ICONS: Record<string, LucideIcon> = {
  "/": ChartLine,
  "/admin": ChartLine,
  "/conversations": MessageCircle,
  "/signals": Activity,
  "/settings": Settings,
  "/agents": Bot,
  "/admin/funds": Building2,
};

function navIconForHref(href: string): LucideIcon | undefined {
  if (NAV_ICONS[href]) return NAV_ICONS[href];
  if (href.endsWith("/conversations")) return MessageCircle;
  if (href.endsWith("/signals")) return Activity;
  if (href.endsWith("/settings")) return Settings;
  if (href.includes("/agents")) return Bot;
  return undefined;
}

export function DashboardSidebar({
  view,
  fundKey,
  switcherOptions,
  brandSubtitle,
}: {
  view: FundNavView;
  fundKey: string;
  switcherOptions: SwitcherOption[];
  brandSubtitle: string;
}) {
  const [open, setOpen] = useState(false);
  const menuButtonId = useId();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      document.getElementById(menuButtonId)?.focus();
    }
  };

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <Brand subtitle={brandSubtitle} />
        <Button
          id={menuButtonId}
          type="button"
          variant="ghost"
          shape="icon"
          aria-label="Open navigatie"
          onClick={() => setOpen(true)}
        >
          <Icon icon={Menu} className="h-5 w-5" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          closeLabel="Sluit navigatie"
          className="left-0 top-0 h-full max-h-none w-64 max-w-none translate-x-0 translate-y-0 rounded-none border-r p-0 shadow-[var(--elevation-raised)] md:hidden"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Navigatie</DialogTitle>
          <SidebarBody
            view={view}
            fundKey={fundKey}
            switcherOptions={switcherOptions}
            brandSubtitle={brandSubtitle}
            footer={<SignOutForm />}
            onNavigate={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <SidebarBody
          view={view}
          fundKey={fundKey}
          switcherOptions={switcherOptions}
          brandSubtitle={brandSubtitle}
          footer={<SignOutForm />}
        />
      </aside>
    </>
  );
}

function SidebarBody({
  view,
  fundKey,
  switcherOptions,
  brandSubtitle,
  footer,
  onNavigate,
}: {
  view: FundNavView;
  fundKey: string;
  switcherOptions: SwitcherOption[];
  brandSubtitle: string;
  footer: ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const chrome = view === "admin" ? parseAdminChromePath(pathname) : null;
  const navFundKey = chrome?.switcherKey ?? fundKey;
  const links = chromeNavLinks({
    view,
    nav: chrome?.nav ?? "fund",
    fundKey: navFundKey,
    pathname,
  });
  const showSwitcher = switcherOptions.length > 0;

  return (
    <div className="flex h-full flex-col px-4 py-5">
      <Brand subtitle={brandSubtitle} />
      <div className="mt-8 flex min-h-0 flex-1 flex-col gap-6">
        {showSwitcher ? (
          <section className="min-w-0">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-subtle">
              Fonds
            </p>
            <FundSwitcher fundKey={navFundKey} options={switcherOptions} />
          </section>
        ) : null}
        <nav aria-label="Hoofdnavigatie" className="flex min-h-0 flex-col gap-0.5">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              // Default (`undefined`) = partial prefetch: the route shell up to its `loading.tsx`,
              // without the page's data fetch. `true` prefetches the *full* dynamic route, and
              // every sidebar link is in the viewport — so that fired a complete server render,
              // fund-schema reads and all, for every nav item on every page load. The selected
              // route stays off entirely: it is already rendered, and prefetching the route you
              // are on re-enters it.
              prefetch={item.selected ? false : undefined}
              aria-current={item.selected ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-2 text-sm font-medium",
                // Keyboard users get the same visible position that aria-current gives a screenreader.
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                item.selected
                  ? "bg-surface-sunk text-text"
                  : "text-text-muted hover:bg-surface-sunk hover:text-text",
              )}
            >
              <NavIcon href={item.href} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-6">{footer}</div>
      </div>
    </div>
  );
}

function NavIcon({ href }: { href: string }) {
  const icon = navIconForHref(href);
  if (!icon) return null;
  return <Icon icon={icon} />;
}

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] bg-primary text-on-primary">
        <span className="text-sm font-semibold">W</span>
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-text">Wunderstack</p>
        <p className="text-xs text-text-muted">{subtitle}</p>
      </div>
    </div>
  );
}
