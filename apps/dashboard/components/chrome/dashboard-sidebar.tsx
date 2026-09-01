"use client";

import { Button, cn } from "@wunderstack/ui";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FundSwitcher } from "@/components/fund/fund-switcher";
import { SignOutForm } from "@/components/chrome/sign-out-form";
import type { ChromeNavLink } from "@/lib/fund-nav";
import type { SwitcherOption } from "@/lib/switcher-options";

export function DashboardSidebar({
  fundKey,
  switcherOptions,
  brandSubtitle,
  links,
}: {
  fundKey: string;
  switcherOptions: SwitcherOption[];
  brandSubtitle: string;
  links: ChromeNavLink[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <Brand subtitle={brandSubtitle} />
        <Button
          type="button"
          variant="ghost"
          shape="icon"
          aria-label="Open navigatie"
          onClick={() => setOpen(true)}
        >
          <MenuIcon />
        </Button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Sluit navigatie"
            className="absolute inset-0 bg-text/20"
            onClick={() => setOpen(false)}
          />
          <nav className="relative flex h-full w-64 flex-col border-r border-border bg-surface shadow-[var(--elevation-raised)]">
            <div className="absolute right-2 top-2">
              <Button
                type="button"
                variant="ghost"
                shape="icon"
                aria-label="Sluit navigatie"
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </Button>
            </div>
            <SidebarBody
              fundKey={fundKey}
              switcherOptions={switcherOptions}
              brandSubtitle={brandSubtitle}
              links={links}
              footer={<SignOutForm />}
              onNavigate={() => setOpen(false)}
            />
          </nav>
        </div>
      ) : null}

      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <SidebarBody
          fundKey={fundKey}
          switcherOptions={switcherOptions}
          brandSubtitle={brandSubtitle}
          links={links}
          footer={<SignOutForm />}
        />
      </aside>
    </>
  );
}

function SidebarBody({
  fundKey,
  switcherOptions,
  brandSubtitle,
  links,
  footer,
  onNavigate,
}: {
  fundKey: string;
  switcherOptions: SwitcherOption[];
  brandSubtitle: string;
  links: ChromeNavLink[];
  footer: ReactNode;
  onNavigate?: () => void;
}) {
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
            <FundSwitcher fundKey={fundKey} options={switcherOptions} />
          </section>
        ) : null}
        <nav aria-label="Hoofdnavigatie" className="flex min-h-0 flex-col gap-0.5">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.href !== "/" && item.href !== "/admin"}
              aria-current={item.selected ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "rounded-[var(--radius-control)] px-2.5 py-2 text-sm font-medium",
                // Keyboard users get the same visible position that aria-current gives a screenreader.
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                item.selected
                  ? "bg-surface-sunk text-text"
                  : "text-text-muted hover:bg-surface-sunk hover:text-text",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-6">{footer}</div>
      </div>
    </div>
  );
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

function MenuIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeWidth="1.75" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeWidth="1.75" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
