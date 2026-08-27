import { DEFAULT_ARTICLE_50_NOTICE, tenantTextsSchema } from "@wunderstack/shared";
import { Card } from "@wunderstack/ui";
import { notFound } from "next/navigation";
import { getFundCached, getInstanceCached } from "@/lib/fund-lookups";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";
import { TextsForm } from "./texts-form";

export default async function AgentTextsPage({
  params,
}: {
  params: Promise<{ fundKey: string; agentKey: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent } = await params;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  if (!fundKey || !agentKey || agentKey === "roleplay") notFound();

  const [fund, instance] = await Promise.all([
    getFundCached(fundKey),
    getInstanceCached(fundKey, agentKey),
  ]);
  if (!fund || !instance) notFound();

  const texts = tenantTextsSchema.parse(instance.texts ?? {});

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="text-sm font-semibold">Teksten</h3>
        <p className="mt-1 text-sm text-text-muted">
          Tagline, intro, Artikel 50 en starters voor deze agent. Huisstijl staat op fondsniveau.
        </p>
        <p className="mt-2 text-xs text-text-subtle">
          Standaard Artikel 50: {DEFAULT_ARTICLE_50_NOTICE}
        </p>
      </div>
      <TextsForm fundKey={fund.key} agentKey={agentKey} texts={texts} />
    </Card>
  );
}
