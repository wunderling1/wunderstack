import { Card } from "@wunderstack/ui";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getFundCached, getInstanceCached } from "@/lib/fund-lookups";
import { agentLabel } from "@/lib/release-manifest";
import { parseAgentKey, parseFundKey } from "@/lib/route-params";
import { CorsForm, RotateKeyForm } from "../distribution-forms";
import { EmbedSnippet } from "../snippet";

function scriptBase(): string {
  return (env.EMBED_SCRIPT_BASE ?? "http://localhost:3000").replace(/\/$/, "");
}

export default async function AgentDistributionPage({
  params,
}: {
  params: Promise<{ fundKey: string; agentKey: string }>;
}) {
  const { fundKey: rawFund, agentKey: rawAgent } = await params;
  const fundKey = parseFundKey(rawFund);
  const agentKey = parseAgentKey(rawAgent);
  if (!fundKey || !agentKey) notFound();

  const [fund, instance] = await Promise.all([
    getFundCached(fundKey),
    getInstanceCached(fundKey, agentKey),
  ]);
  if (!fund || !instance) notFound();

  const displayName = fund.name ?? fund.key;
  const label = agentLabel(agentKey);
  const snippet = `<script src="${scriptBase()}/embed.js" data-key="${instance.publicKey}" data-agent="${agentKey}" async></script>`;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Embedsnippet</h3>
        <p className="text-sm text-text-muted">
          Plak dit op de site van {displayName}. De sleutel bepaalt welke agent antwoordt.
        </p>
        <EmbedSnippet snippet={snippet} />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Sleutel</h3>
        <RotateKeyForm
          fundKey={fund.key}
          agentKey={agentKey}
          fundName={displayName}
          agentLabel={label}
          publicKey={instance.publicKey}
        />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Toegestane websites</h3>
        <p className="text-sm text-text-muted">
          Origins die de embed mogen framemen (CSP frame-ancestors) en cross-origin mogen
          aanroepen (CORS). Eén URL per regel.
        </p>
        <CorsForm
          fundKey={fund.key}
          agentKey={agentKey}
          corsAllowlist={instance.corsAllowlist}
        />
      </Card>
    </div>
  );
}
