import { listTenantConfigs, type TenantConfig } from "@wunderstack/db";
import { Button, Card, Field, Textarea } from "@wunderstack/ui";
import Link from "next/link";
import { env } from "@/lib/env";
import { createTenantConfig, rotateKey, updateCors, updateTheme } from "./actions";
import { EmbedSnippet } from "./snippet";

/**
 * Embed & distribution console (Fase 4, admin-only, D12). Per tenant: snippets per agent instance,
 * tenant-key display + rotation, CORS allowlist, and the curated theming subset (D17).
 */
export const dynamic = "force-dynamic";

function scriptBase(): string {
  return (env.EMBED_SCRIPT_BASE ?? "http://localhost:3000").replace(/\/$/, "");
}

export default async function EmbedConsole() {
  const configs = await listTenantConfigs();
  const base = scriptBase();
  const grouped = groupByTenant(configs);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Embed &amp; distributie</h2>
          <p className="text-sm text-text-muted">
            Snippet per agent-instance (CAO + arbocatalogus), tenant-key, CORS-allowlist en theming.
            De key beslist welke agent draait; <code>data-agent</code> is alleen een hint.
          </p>
        </div>
        <Link href="/admin" className="ml-auto whitespace-nowrap text-sm text-text-muted hover:text-text">
          ← Beheer
        </Link>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Nieuwe tenant-config (CAO-instance)</h3>
        <p className="mt-1 text-sm text-text-muted">
          Maakt een CAO-instance met een verse tenant-key. Voor arbocatalogus: tweede instance met agent
          <code className="mx-1">arbo</code> via seed-script of DB.
        </p>
        <form action={createTenantConfig} className="mt-3 flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-text-muted">Tenant-id</span>
            <Field name="tenantId" required placeholder="oomt" />
          </label>
          <Button type="submit">Aanmaken</Button>
        </form>
      </Card>

      {grouped.length === 0 ? (
        <p className="text-sm text-text-muted">Nog geen tenant-configs. Maak er hierboven een aan.</p>
      ) : (
        grouped.map((group) => <TenantGroupCard key={group.tenantId} group={group} base={base} />)
      )}
    </div>
  );
}

interface TenantGroup {
  tenantId: string;
  instances: TenantConfig[];
}

function groupByTenant(configs: TenantConfig[]): TenantGroup[] {
  const map = new Map<string, TenantConfig[]>();
  for (const config of configs) {
    const list = map.get(config.tenantId) ?? [];
    list.push(config);
    map.set(config.tenantId, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tenantId, instances]) => ({
      tenantId,
      instances: instances.sort((a, b) => a.agentKey.localeCompare(b.agentKey)),
    }));
}

function TenantGroupCard({ group, base }: { group: TenantGroup; base: string }) {
  const primary = group.instances[0];
  if (!primary) return null;
  const theme = (primary.theme ?? {}) as Record<string, string>;
  const texts = (primary.texts ?? {}) as Record<string, string>;

  return (
    <Card className="flex flex-col gap-6 p-5">
      <div className="flex items-center gap-3">
        <h3 className="font-display text-base font-semibold">{group.tenantId}</h3>
        <span className="text-xs text-text-muted">{group.instances.length} instance(s)</span>
      </div>

      <div className="flex flex-col gap-4">
        {group.instances.map((config) => {
          const snippet = `<script src="${base}/embed.js" data-key="${config.publicKey}" data-agent="${config.agentKey}" async></script>`;
          return (
            <div key={`${config.tenantId}-${config.agentKey}`} className="rounded-md border border-border p-4">
              <p className="text-xs font-medium text-text-muted">Agent: {config.agentKey}</p>
              <EmbedSnippet snippet={snippet} />
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {group.instances.map((config) => (
          <form key={`rotate-${config.agentKey}`} action={rotateKey} className="flex flex-col gap-2">
            <input type="hidden" name="tenantId" value={config.tenantId} />
            <input type="hidden" name="agentKey" value={config.agentKey} />
            <span className="text-sm font-medium">Tenant-key ({config.agentKey})</span>
            <code className="truncate rounded bg-surface-sunk px-2 py-1 text-xs">{config.publicKey}</code>
            <Button type="submit" variant="ghost" size="default" className="self-start">
              Roteer key
            </Button>
          </form>
        ))}

        <form action={updateCors} className="flex flex-col gap-2">
          <input type="hidden" name="tenantId" value={primary.tenantId} />
          <input type="hidden" name="agentKey" value={primary.agentKey} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">CORS-allowlist (CAO-instance)</span>
            <Textarea
              name="corsAllowlist"
              rows={3}
              defaultValue={primary.corsAllowlist.join("\n")}
              placeholder="https://www.fonds.nl"
            />
          </label>
          <Button type="submit" variant="ghost" size="default" className="self-start">Opslaan</Button>
        </form>
      </div>

      <form action={updateTheme} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="tenantId" value={primary.tenantId} />
        <input type="hidden" name="agentKey" value={primary.agentKey} />
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
          <Field name="tagline" defaultValue={texts.tagline ?? ""} placeholder="Vragen over je CAO?" />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="text-text-muted">Intro (lege chat)</span>
          <Field
            name="intro"
            defaultValue={texts.intro ?? ""}
            placeholder="De AI-assistent geeft antwoord uit de catalogus, met de bron erbij."
          />
        </label>
        <Button type="submit" variant="ghost" size="default" className="self-start md:col-span-2">
          Theming opslaan
        </Button>
      </form>
    </Card>
  );
}
