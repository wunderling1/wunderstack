import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getFundCached } from "@/lib/fund-lookups";
import { parseFundKey } from "@/lib/route-params";

/** Shared fund existence check. Chrome and the switcher query live in `(fund-console)`. */
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

  const fund = await getFundCached(fundKey);
  if (!fund) {
    notFound();
  }

  return children;
}
