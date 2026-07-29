import { listTenantConfigs, type TenantConfig } from "@wunderstack/db";
import { Button, Card, Field, Textarea } from "@wunderstack/ui";
import Link from "next/link";
import { env } from "@/lib/env";
import { createTenantConfig, rotateKey, updateCors, updateTheme } from "./actions";
import { EmbedSnippet } from "./snippet";

/**
 * Embed & distribution console (Fase 4, admin-only, D12). Per tenant: the stable snippet + copy,
 * tenant-key display + rotation, CORS allowlist, and the curated theming subset (D17). All writes go
 * through the tenant_config_writer connection via the server actions.
 */
export const dynamic = "force-dynamic";

function scriptBase(): string {
  return (env.EMBED_SCRIPT_BASE ?? "http://localhost:3000").replace(/\/$/, "");
}

export default async function EmbedConsole() {
  const configs = await listTenantConfigs();
  const base = scriptBase();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Embed &amp; distributie</h2>
          <p className="text-sm text-text-muted">
            Snippet, tenant-key, CORS-allowlist en theming per fonds. De snippet blijft stabiel; alles
            wat je hier wijzigt gaat live via <code>GET /config</code> zonder nieuwe snippet.
          </p>
        </div>
        <Link href="/admin" className="ml-auto whitespace-nowrap text-sm text-text-muted hover:text-text">
          ← Beheer
        </Link>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Nieuwe tenant-config</h3>
        <p className="mt-1 text-sm text-text-muted">
          Maakt een config met een verse tenant-key aan (of laat een bestaande ongemoeid).
        </p>
        <form action={createTenantConfig} className="mt-3 flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-text-muted">Tenant-id</span>
            <Field name="tenantId" required placeholder="oomt" />
          </label>
          <Button type="submit">Aanmaken</Button>
        </form>
      </Card>

      {configs.length === 0 ? (
        <p className="text-sm text-text-muted">Nog geen tenant-configs. Maak er hierboven een aan.</p>
      ) : (
        configs.map((config) => <TenantCard key={config.tenantId} config={config} base={base} />)
      )}
    </div>
  );
}

function TenantCard({ config, base }: { config: TenantConfig; base: string }) {
  const theme = (config.theme ?? {}) as Record<string, string>;
  const texts = (config.texts ?? {}) as Record<string, string>;
  const snippet = `<script src="${base}/embed.js" data-key="${config.publicKey}" data-agent="${config.agentId}" async></script>`;

  return (
    <Card className="flex flex-col gap-6 p-5">
      <div className="flex items-center gap-3">
        <h3 className="font-display text-base font-semibold">{config.tenantId}</h3>
        <span className="text-xs text-text-muted">agent: {config.agentId}</span>
      </div>

      <EmbedSnippet snippet={snippet} />

      <div className="grid gap-6 md:grid-cols-2">
        <form action={rotateKey} className="flex flex-col gap-2">
          <input type="hidden" name="tenantId" value={config.tenantId} />
          <span className="text-sm font-medium">Tenant-key</span>
          <code className="truncate rounded bg-surface-sunk px-2 py-1 text-xs">{config.publicKey}</code>
          <p className="text-xs text-text-subtle">
            Publiek (mag in de snippet staan). Roteren maakt oude snippets ongeldig.
          </p>
          <Button type="submit" variant="ghost" size="default" className="self-start">
            Roteer key
          </Button>
        </form>

        <form action={updateCors} className="flex flex-col gap-2">
          <input type="hidden" name="tenantId" value={config.tenantId} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">CORS-allowlist</span>
            <Textarea
              name="corsAllowlist"
              rows={3}
              defaultValue={config.corsAllowlist.join("\n")}
              placeholder="https://www.fonds.nl"
            />
          </label>
          <p className="text-xs text-text-subtle">Eén origin per regel. Alleen deze mogen cross-origin.</p>
          <Button type="submit" variant="ghost" size="default" className="self-start">
            Opslaan
          </Button>
        </form>
      </div>

      <form action={updateTheme} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="tenantId" value={config.tenantId} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Primaire kleur (hex)</span>
          <Field name="primary" defaultValue={theme.primary ?? ""} placeholder="#4f46e5" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Radius</span>
          <Field name="radius" defaultValue={theme.radius ?? ""} placeholder="12px" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Logo-URL</span>
          <Field name="logo" defaultValue={theme.logo ?? ""} placeholder="https://…/logo.svg" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Tagline</span>
          <Field name="tagline" defaultValue={texts.tagline ?? ""} placeholder="Stel je vraag over de CAO" />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="text-text-muted">Artikel 50-melding (leeg = standaardtekst)</span>
          <Field name="article50" defaultValue={texts.article50 ?? ""} />
        </label>
        <div className="md:col-span-2">
          <Button type="submit">Theming opslaan</Button>
        </div>
      </form>
    </Card>
  );
}
