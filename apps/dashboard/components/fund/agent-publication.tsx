import { DEFAULT_ARTICLE_50_NOTICE, isGroundedAgentKey, type TenantTexts } from "@wunderstack/shared";
import { Card } from "@wunderstack/ui";
import type { ReactNode } from "react";
import { CorsForm, RotateKeyForm } from "@/app/(admin)/admin/funds/[fundKey]/agents/[agentKey]/distribution-forms";
import { EmbedSnippet } from "@/app/(admin)/admin/funds/[fundKey]/agents/[agentKey]/snippet";
import { TextsForm } from "@/app/(admin)/admin/funds/[fundKey]/agents/[agentKey]/texts/texts-form";

export function AgentPublicationPanel({
  fundKey,
  agentKey,
  fundName,
  agentLabel,
  publicKey,
  corsAllowlist,
  texts,
  snippet,
  canWrite,
  extra,
}: {
  fundKey: string;
  agentKey: string;
  fundName: string;
  agentLabel: string;
  publicKey: string;
  corsAllowlist: string[];
  texts: TenantTexts | null;
  snippet: string;
  canWrite: boolean;
  extra?: ReactNode;
}) {
  const grounded = isGroundedAgentKey(agentKey);

  return (
    <div className="flex flex-col gap-6">
      {grounded && texts ? (
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <h3 className="text-sm font-semibold">Teksten</h3>
            <p className="mt-1 text-sm text-text-muted">
              Tagline, intro, Artikel 50 en starters. Huisstijl staat op fondsniveau.
            </p>
            <p className="mt-2 text-xs text-text-subtle">
              Standaard Artikel 50: {DEFAULT_ARTICLE_50_NOTICE}
            </p>
          </div>
          {canWrite ? (
            <TextsForm fundKey={fundKey} agentKey={agentKey} texts={texts} />
          ) : (
            <TextsReadout texts={texts} />
          )}
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Embedsnippet</h3>
        <p className="text-sm text-text-muted">
          Plak dit op de site van {fundName}. De sleutel bepaalt welke agent antwoordt.
        </p>
        <EmbedSnippet snippet={snippet} />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-sm font-semibold">Toegestane websites</h3>
        <p className="text-sm text-text-muted">
          Origins die de embed mogen framemen (CSP frame-ancestors) en cross-origin mogen
          aanroepen (CORS). Eén URL per regel.
        </p>
        {canWrite ? (
          <CorsForm fundKey={fundKey} agentKey={agentKey} corsAllowlist={corsAllowlist} />
        ) : (
          <p className="whitespace-pre-wrap font-mono text-xs text-text">
            {corsAllowlist.length === 0 ? "Geen origins ingesteld." : corsAllowlist.join("\n")}
          </p>
        )}
      </Card>

      {extra}

      <Card className="flex flex-col gap-4 border border-state-danger-fg/30 bg-state-caution-bg p-5">
        <div>
          <h3 className="text-sm font-semibold">Sleutelrotatie</h3>
          <p className="mt-1 text-sm text-text-muted">
            Onomkeerbaar: de huidige snippet stopt met werken. Hoort niet tussen de tekstvelden.
          </p>
        </div>
        {canWrite ? (
          <RotateKeyForm
            fundKey={fundKey}
            agentKey={agentKey}
            fundName={fundName}
            agentLabel={agentLabel}
            publicKey={publicKey}
          />
        ) : (
          <div>
            <span className="text-sm font-medium">Publieke sleutel</span>
            <code className="mt-1 block truncate rounded bg-surface-sunk px-2 py-1 text-xs">
              {publicKey}
            </code>
          </div>
        )}
      </Card>
    </div>
  );
}

function TextsReadout({ texts }: { texts: TenantTexts }) {
  return (
    <dl className="flex flex-col gap-3 text-sm">
      <div>
        <dt className="text-text-muted">Tagline</dt>
        <dd>{texts.tagline || "n.n.b."}</dd>
      </div>
      <div>
        <dt className="text-text-muted">Intro</dt>
        <dd>{texts.intro || "n.n.b."}</dd>
      </div>
      <div>
        <dt className="text-text-muted">Artikel 50</dt>
        <dd>{texts.article50 || DEFAULT_ARTICLE_50_NOTICE}</dd>
      </div>
      <div>
        <dt className="text-text-muted">Starters</dt>
        <dd className="whitespace-pre-wrap">
          {(texts.starters ?? []).length === 0 ? "n.n.b." : (texts.starters ?? []).join("\n")}
        </dd>
      </div>
    </dl>
  );
}
