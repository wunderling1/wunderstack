"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import type { PlaygroundAgent } from "@/lib/runtime-config";
import { AgentSelector } from "./agent-selector";
import { FundSelector } from "./fund-selector";

interface PlaygroundSidebarProps {
  agent: PlaygroundAgent;
  funds: string[];
  activeFund: string;
}

/** Playground chrome: brand + fund/agent pickers. App-local (not a shared UI primitive). */
export function PlaygroundSidebar({ agent, funds, activeFund }: PlaygroundSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <Brand />
        <button
          type="button"
          aria-label="Open navigatie"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] text-text hover:bg-surface-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page"
        >
          <Menu aria-hidden className="h-5 w-5" />
        </button>
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
              <button
                type="button"
                aria-label="Sluit navigatie"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] text-text hover:bg-surface-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page"
              >
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
            <SidebarBody agent={agent} funds={funds} activeFund={activeFund} />
          </nav>
        </div>
      ) : null}

      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <SidebarBody agent={agent} funds={funds} activeFund={activeFund} />
      </aside>
    </>
  );
}

function SidebarBody({ agent, funds, activeFund }: PlaygroundSidebarProps) {
  return (
    <div className="flex h-full flex-col px-4 py-5">
      <Brand />
      <div className="mt-8 flex flex-col gap-6">
        <section className="min-w-0">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-subtle">Fonds</p>
          <FundSelector funds={funds} active={activeFund} />
        </section>
        <section>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-subtle">Agent</p>
          <AgentSelector active={agent} />
        </section>
      </div>
      <p className="mt-auto pt-6 text-xs text-text-subtle">Tenant-zero demo</p>
    </div>
  );
}

function Brand() {
  return (
    <p className="font-display text-[28px] font-normal leading-none text-text">Wunderstack</p>
  );
}
