import { fetchPassage } from "@wunderstack/agents";
import { getTenantId } from "@wunderstack/tenant";
import { getAgentById } from "@/lib/agent";
import { corsHeaders, preflight } from "@/lib/cors";
import { resolveEmbedAuth } from "@/lib/embed-auth";
import { resolveRequestScope } from "@/lib/instance-scope";
import { readBodyBounded } from "@/lib/http";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { tenantCorsAllowlist } from "@/lib/tenant-cors";
import { passageRequestSchema, passageResponseSchema } from "./contract";

/**
 * POST /api/passage — expand a citation to its full parent passage ("toon volledige passage").
 * Thin controller: embed-auth → Zod → fund scope → agentKey from the instance → agent seam.
 * `agentKey` is never taken from the client body (corpus isolation).
 */

export const runtime = "nodejs";

const RATE_LIMIT = { windowMs: 60_000, max: 60 };

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request, await tenantCorsAllowlist(getTenantId()));
}

export async function POST(request: Request): Promise<Response> {
  const auth = await resolveEmbedAuth(request);
  const allowlist = auth.ok
    ? (auth.config?.corsAllowlist ?? [])
    : await tenantCorsAllowlist(getTenantId());
  const cors = corsHeaders(request, allowlist);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: cors });
  }

  const limit = checkRateLimit(clientKey(request), RATE_LIMIT);
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds), ...cors } },
    );
  }

  const body = await readBodyBounded(request);
  if (!body.ok) {
    return Response.json({ error: body.error }, { status: body.status, headers: cors });
  }

  let json: unknown;
  try {
    json = JSON.parse(body.raw);
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
  }

  const parsed = passageRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
  }

  const scope = resolveRequestScope(auth.config, parsed.data.fund);
  if (!scope.ok) {
    return Response.json({ error: scope.error }, { status: scope.status, headers: cors });
  }

  const agentId = scope.agentKey;
  try {
    getAgentById(agentId);
  } catch {
    return Response.json({ error: "unknown_agent" }, { status: 400, headers: cors });
  }

  try {
    const passage = await fetchPassage({
      chunkId: parsed.data.chunkId,
      fund: scope.fund,
      agentKey: agentId,
    });
    if (!passage) {
      return Response.json({ error: "not_found" }, { status: 404, headers: cors });
    }
    return Response.json(passageResponseSchema.parse(passage), { headers: cors });
  } catch (error) {
    console.error("[api/passage] failed to fetch passage:", error);
    return Response.json({ error: "passage_failed" }, { status: 502, headers: cors });
  }
}
