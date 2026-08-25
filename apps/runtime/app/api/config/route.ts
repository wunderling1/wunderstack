import { getAgentConfig, getFundTheme, parseAgentConfigData } from "@wunderstack/db";
import {
  DEFAULT_ARTICLE_50_NOTICE,
  tenantPublicConfigSchema,
  tenantTextsSchema,
  tenantThemeSchema,
} from "@wunderstack/shared";
import { getTenantId } from "@wunderstack/tenant";
import { corsHeaders, preflight } from "@/lib/cors";
import { resolveEmbedAuth } from "@/lib/embed-auth";
import { resolveRequestScope } from "@/lib/instance-scope";
import { tenantCorsAllowlist } from "@/lib/tenant-cors";

const DEFAULT_STATUS_LABELS = {
  cao: {
    searching: "CAO doorzoeken",
    retrieved: "Passages beoordelen",
    generating: "Bronvermelding controleren",
  },
  arbo: {
    searching: "Catalogus doorzoeken",
    retrieved: "Passages beoordelen",
    generating: "Bronvermelding controleren",
  },
} as const;

/**
 * GET /api/config — the public config the embed fetches at boot (Fase 4). Serves this instance's
 * tenant theme + texts + resolved Article 50 notice, so the snippet stays static and everything
 * variable is fetched at runtime (D17). Key-gated + CORS-gated for browser callers.
 */
export const runtime = "nodejs";

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request, await tenantCorsAllowlist(getTenantId()));
}

export async function GET(request: Request): Promise<Response> {
  const auth = await resolveEmbedAuth(request);
  const allowlist = auth.ok
    ? (auth.config?.corsAllowlist ?? [])
    : await tenantCorsAllowlist(getTenantId());
  const cors = corsHeaders(request, allowlist);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: cors });
  }

  const config = auth.config;
  const scope = resolveRequestScope(config, undefined);
  if (!scope.ok) {
    return Response.json({ error: scope.error }, { status: scope.status, headers: cors });
  }
  const agentKey = scope.agentKey;
  const fund = scope.fund;
  // Theme is fund-level (S1). Use this instance's tenantId (= fund whose widget is embedded),
  // not scope.fund (corpus fund), so a multi-fund runtime still serves the host fund's branding.
  const fundTheme = config?.tenantId
    ? await getFundTheme(config.tenantId).catch(() => ({}))
    : {};
  const theme = tenantThemeSchema.parse(fundTheme);
  const parsedTexts = tenantTextsSchema.parse(config?.texts ?? {});
  const agentRow = await getAgentConfig(agentKey, fund).catch(() => null);
  const agentData = parseAgentConfigData(agentRow?.config);
  const statusDefaults = DEFAULT_STATUS_LABELS[agentKey === "arbo" ? "arbo" : "cao"];
  const texts = tenantTextsSchema.parse({
    ...parsedTexts,
    ...(parsedTexts.starterCategories === undefined && agentData.starterCategories
      ? { starterCategories: agentData.starterCategories }
      : {}),
  });
  const body = tenantPublicConfigSchema.parse({
    agentId: agentKey,
    theme,
    texts,
    article50: texts.article50 ?? DEFAULT_ARTICLE_50_NOTICE,
    fund,
    statusLabels: agentData.statusLabels ?? statusDefaults,
  });

  return Response.json(body, {
    headers: { "cache-control": "no-store", ...cors },
  });
}
