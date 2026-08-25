import { getFund, getFundTheme, listInstances } from "@wunderstack/db";
import { AGENT_KEY_LABELS } from "@wunderstack/shared";
import { Card } from "@wunderstack/ui";
import { notFound } from "next/navigation";
import { parseFundKey } from "@/lib/route-params";
import { BrandingForm } from "./branding-form";

export const dynamic = "force-dynamic";

export default async function FundBrandingPage({
  params,
}: {
  params: Promise<{ fundKey: string }>;
}) {
  const { fundKey: raw } = await params;
  const fundKey = parseFundKey(raw);
  if (!fundKey) notFound();

  const fund = await getFund(fundKey);
  if (!fund) notFound();

  const [themeRaw, instances] = await Promise.all([
    getFundTheme(fundKey),
    listInstances(fundKey),
  ]);
  const theme = themeRaw as {
    primary?: string;
    accent?: string;
    radius?: string;
    logo?: string;
  };
  const agentNames = instances.map(
    (row) => AGENT_KEY_LABELS[row.agentKey as keyof typeof AGENT_KEY_LABELS] ?? row.agentKey,
  );

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="text-sm font-semibold">Huisstijl</h3>
        <p className="mt-1 text-sm text-text-muted">
          Kleur, accent, radius en logo voor alle agents van dit fonds. Geen per-agent override.
        </p>
      </div>
      <BrandingForm fundKey={fund.key} theme={theme} agentNames={agentNames} />
    </Card>
  );
}
