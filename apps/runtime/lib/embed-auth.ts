import { getInstance, getInstanceByPublicKey, type TenantConfig } from "@wunderstack/db";
import { isTenantKeyFormat } from "@wunderstack/shared";
import { getTenantId } from "@wunderstack/tenant";

/**
 * Public tenant-key check for the embed surface (Fase 4). The runtime serves exactly one tenant
 * (D15). The key resolves a specific agent instance row (`tenant_id` × `agent_key`).
 *
 * Enforcement model:
 *  - Unconfigured tenant (no instance / no key): open + rate-limited (tenant zero demo, local dev).
 *  - Browser cross-origin (an `Origin` header is present): the key is REQUIRED and must match an
 *    instance for this tenant; the route additionally gates the origin via the CORS allowlist.
 *  - Non-browser callers (no `Origin`: the fund's own server-side proxy, curl): trusted path — a key
 *    is not required, but if one is supplied it must be valid. Rate limiting still applies to all.
 *
 * NOTE: the tenant-key is a PUBLIC identifier (it sits in the embed snippet in plain sight), and CORS
 * is browser-only, so neither the key nor the allowlist is a real server-side authorization boundary.
 * Abuse is bounded by the per-IP/per-key rate limits and RUNTIME_DAILY_CAP, not by key secrecy.
 *
 * The embed snippet's `data-agent` attribute is NOT a trust boundary: it is a UI hint for widgets that
 * can show multiple agent instances. The server resolves the agent from the instance row after key
 * validation; a client-supplied agent id in the chat body must never override that choice.
 */

const KEY_HEADER = "x-wunderstack-key";

export type EmbedAuth =
  | { ok: true; config: TenantConfig | null }
  | { ok: false; status: 401 | 403; error: string };

async function resolveInstanceByKey(publicKey: string, tenantId: string): Promise<TenantConfig | null> {
  const instance = await getInstanceByPublicKey(publicKey).catch(() => null);
  if (!instance || instance.tenantId !== tenantId) {
    return null;
  }
  return instance;
}

export async function resolveEmbedAuth(request: Request): Promise<EmbedAuth> {
  const tenantId = getTenantId();
  const provided =
    request.headers.get(KEY_HEADER) ?? new URL(request.url).searchParams.get("key") ?? "";
  const hasOrigin = request.headers.get("origin") !== null;

  if (hasOrigin) {
    if (!provided || !isTenantKeyFormat(provided)) {
      return { ok: false, status: 401, error: "missing_or_malformed_key" };
    }
    const instance = await resolveInstanceByKey(provided, tenantId);
    if (!instance) {
      return { ok: false, status: 403, error: "invalid_key" };
    }
    return { ok: true, config: instance };
  }

  // Non-browser path: optional key, but a supplied key must be valid for this tenant.
  if (provided) {
    const instance = await resolveInstanceByKey(provided, tenantId);
    if (!instance) {
      return { ok: false, status: 403, error: "invalid_key" };
    }
    return { ok: true, config: instance };
  }

  const defaultInstance = await getInstance(tenantId, "cao").catch(() => null);
  return { ok: true, config: defaultInstance };
}
