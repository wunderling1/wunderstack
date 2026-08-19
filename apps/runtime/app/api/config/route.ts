import {
  DEFAULT_ARTICLE_50_NOTICE,
  tenantPublicConfigSchema,
  tenantTextsSchema,
  tenantThemeSchema,
} from "@wunderstack/shared";
import { getTenantId } from "@wunderstack/tenant";
import { corsHeaders, preflight } from "@/lib/cors";
import { resolveEmbedAuth } from "@/lib/embed-auth";
import { instanceFund } from "@/lib/fund-scope";
import { tenantCorsAllowlist } from "@/lib/tenant-cors";

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
  const theme = tenantThemeSchema.parse(config?.theme ?? {});
  const texts = tenantTextsSchema.parse(config?.texts ?? {});
  const body = tenantPublicConfigSchema.parse({
    agentId: config?.agentKey ?? "cao",
    theme,
    texts,
    article50: texts.article50 ?? DEFAULT_ARTICLE_50_NOTICE,
    fund: instanceFund(),
  });

  return Response.json(body, {
    headers: { "cache-control": "no-store", ...cors },
  });
}
