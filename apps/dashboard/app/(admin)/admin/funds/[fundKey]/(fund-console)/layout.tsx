import { Card } from "@wunderstack/ui";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getFundCached } from "@/lib/fund-lookups";
import { parseFundKey } from "@/lib/route-params";
import { FundLevelChrome } from "../fund-chrome";

/**
 * Fund console heading + inactive banner. App chrome lives in the admin layout
 * so agent-detail routes share the same sidebar.
 */
export default async function FundConsoleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = parseFundKey(raw);
  if (!fundKey) {
    notFound();
  }

  const fund = await getFundCached(fundKey);
  if (!fund) {
    notFound();
  }

  const displayName = fund.name ?? fund.key;

  const inactiveBanner =
    fund.status !== "active" ? (
      <Card className="bg-state-caution-bg p-4 text-sm text-text">
        <p className="font-medium">Gedeactiveerd</p>
        <p className="mt-1 text-text-muted">
          Status is inactief. Schema en accounts blijven staan. Hard delete (
          <code className="font-mono">DROP SCHEMA</code>) is geen deel van deze slice.
        </p>
      </Card>
    ) : null;

  return (
    <FundLevelChrome
      fundKey={fund.key}
      displayName={displayName}
      inactiveBanner={inactiveBanner}
    >
      {children}
    </FundLevelChrome>
  );
}
