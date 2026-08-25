"use client";

import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Breadcrumbs,
} from "@wunderstack/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  activeFundTab,
  FUND_TABS,
  fundTabHref,
  isAgentDetailPath,
  switchFundHref,
  type FundTabSegment,
} from "@/lib/fund-tabs";

export interface FundOption {
  key: string;
  name: string;
}

export function FundSwitcher({
  fundKey,
  funds,
}: {
  fundKey: string;
  funds: FundOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-sm text-text-muted">
      <span className="sr-only">Ander fonds</span>
      <select
        className="rounded-[var(--radius-input)] border border-border bg-surface px-2 py-1.5 text-sm text-text"
        value={fundKey}
        onChange={(event) => {
          const next = event.target.value;
          if (next && next !== fundKey) {
            router.push(switchFundHref(pathname, fundKey, next));
          }
        }}
      >
        {funds.map((fund) => (
          <option key={fund.key} value={fund.key}>
            {fund.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FundTabNav({ fundKey }: { fundKey: string }) {
  const pathname = usePathname();
  const active = activeFundTab(pathname, fundKey);

  return (
    <div
      role="tablist"
      aria-label="Fondstabbladen"
      className="inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-border bg-surface-sunk p-1"
    >
      {FUND_TABS.map((tab) => {
        const href = fundTabHref(fundKey, tab.segment as FundTabSegment);
        const selected = active === tab.segment;
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

/** Fund-level chrome; hidden on agent-detail routes (those use the agent layout). */
export function FundLevelChrome({
  fundKey,
  displayName,
  funds,
  inactiveBanner,
  children,
}: {
  fundKey: string;
  displayName: string;
  funds: FundOption[];
  inactiveBanner: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (isAgentDetailPath(pathname, fundKey)) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Breadcrumbs>
            <BreadcrumbItem>
              <BreadcrumbLink href="/admin/funds">Fondsen</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{displayName}</BreadcrumbPage>
            </BreadcrumbItem>
          </Breadcrumbs>
          <div>
            <h2 className="font-display text-lg font-semibold">{displayName}</h2>
            <p className="mt-1 font-mono text-sm text-text-muted">{fundKey}</p>
          </div>
        </div>
        <FundSwitcher fundKey={fundKey} funds={funds} />
      </div>

      {inactiveBanner}

      <FundTabNav fundKey={fundKey} />

      {children}
    </div>
  );
}
