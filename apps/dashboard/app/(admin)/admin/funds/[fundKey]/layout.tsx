import { eq, funds as fundsTable, getDb, getFund } from "@wunderstack/db";
import { Card } from "@wunderstack/ui";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { parseFundKey } from "@/lib/route-params";
import { FundLevelChrome } from "./fund-chrome";

export const dynamic = "force-dynamic";

export default async function FundLayout({
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

  const fund = await getFund(fundKey);
  if (!fund) {
    notFound();
  }

  const activeFunds = await getDb()
    .select({ key: fundsTable.key, name: fundsTable.name })
    .from(fundsTable)
    .where(eq(fundsTable.status, "active"))
    .orderBy(fundsTable.key);

  const displayName = fund.name ?? fund.key;
  const switcherFunds = activeFunds.map((row) => ({
    key: row.key,
    name: row.name ?? row.key,
  }));
  if (!switcherFunds.some((row) => row.key === fund.key)) {
    switcherFunds.unshift({ key: fund.key, name: displayName });
  }

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
      funds={switcherFunds}
      inactiveBanner={inactiveBanner}
    >
      {children}
    </FundLevelChrome>
  );
}
