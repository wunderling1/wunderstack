"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { agentTabHref, agentTabs } from "@/lib/agent-tabs";

export function AgentTabNav({
  fundKey,
  agentKey,
}: {
  fundKey: string;
  agentKey: string;
}) {
  const pathname = usePathname();
  const base = `/admin/funds/${fundKey}/agents/${agentKey}`;
  const tabs = agentTabs(agentKey);

  return (
    <div
      role="tablist"
      aria-label="Agenttabbladen"
      className="inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-border bg-surface-sunk p-1"
    >
      {tabs.map((tab) => {
        const href = agentTabHref(fundKey, agentKey, tab.segment);
        const selected =
          tab.segment === ""
            ? pathname === base || pathname === `${base}/`
            : pathname.startsWith(`${base}/${tab.segment}`);
        return (
          <Link
            key={tab.segment || "overview"}
            href={href}
            role="tab"
            aria-selected={selected}
            aria-current={selected ? "page" : undefined}
            className={
              selected
                ? "rounded-[var(--radius-input)] bg-surface px-3 py-1.5 text-sm font-medium text-text shadow-[var(--elevation-card)]"
                : "rounded-[var(--radius-input)] px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
