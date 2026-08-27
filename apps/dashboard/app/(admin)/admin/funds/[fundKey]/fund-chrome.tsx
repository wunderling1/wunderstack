"use client";

import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Breadcrumbs,
  NavPills,
  navPillClassName,
  Select,
} from "@wunderstack/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  activeFundTab,
  FUND_TABS,
  fundTabHref,
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
    <label className="flex w-auto items-center gap-2 text-sm text-text-muted">
      <span className="sr-only">Ander fonds</span>
      <Select
        className="h-auto w-auto rounded-[var(--radius-input)] py-1.5 pl-2 pr-8"
        value={fundKey}
        aria-label="Ander fonds"
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
      </Select>
    </label>
  );
}

export function FundTabNav({ fundKey }: { fundKey: string }) {
  const pathname = usePathname();
  const active = activeFundTab(pathname, fundKey);

  return (
    <NavPills role="tablist" aria-label="Fondstabbladen">
      {FUND_TABS.map((tab) => {
        const href = fundTabHref(fundKey, tab.segment as FundTabSegment);
        const selected = active === tab.segment;
        return (
          <Link
            key={tab.segment || "overview"}
            href={href}
            prefetch={tab.segment !== ""}
            role="tab"
            aria-selected={selected}
            aria-current={selected ? "page" : undefined}
            className={navPillClassName(selected)}
          >
            {tab.label}
          </Link>
        );
      })}
    </NavPills>
  );
}

/** Fund-level chrome. Mounted only on `(fund-console)` routes, not agent detail. */
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
