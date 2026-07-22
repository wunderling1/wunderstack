import { getTenantConfig, type TenantConfig } from "@wunderstack/db";
import { isTenantKeyFormat } from "@wunderstack/shared";
import { getTenantId } from "@wunderstack/tenant";

/**
 * Public tenant-key check for the embed surface (Fase 4). The runtime serves exactly one tenant
 * (D15), so it validates the caller's key against that tenant's stored `publicKey`.
 *
 * Enforcement model:
 *  - Unconfigured tenant (no tenant_config / no key): open + rate-limited (tenant zero demo, local dev).
 *  - Browser cross-origin (an `Origin` header is present): the key is REQUIRED and must match; the
 *    route additionally gates the origin via the CORS allowlist (browser-enforced only — see lib/cors.ts).
 *  - Non-browser callers (no `Origin`: the fund's own server-side proxy, curl): trusted path — a key
 *    is not required, but if one is supplied it must be valid. Rate limiting still applies to all.
 *
 * NOTE: the tenant-key is a PUBLIC identifier (it sits in the embed snippet in plain sight), and CORS
 * is browser-only, so neither the key nor the allowlist is a real server-side authorization boundary.
 * Abuse is bounded by the per-IP/per-key rate limits and RUNTIME_DAILY_CAP, not by key secrecy.
 */

const KEY_HEADER = "x-wunderstack-key";

export type EmbedAuth =
  | { ok: true; config: TenantConfig | null }
  | { ok: false; status: 401 | 403; error: string };

export async function resolveEmbedAuth(request: Request): Promise<EmbedAuth> {
  const tenantId = getTenantId();
  // getTenantConfig throws when no DB is configured; local/dev then falls back to the open path.
  const config = await getTenantConfig(tenantId).catch(() => null);

  if (!config?.publicKey) {
    return { ok: true, config: config ?? null };
  }

  const provided =
    request.headers.get(KEY_HEADER) ?? new URL(request.url).searchParams.get("key") ?? "";
  const hasOrigin = request.headers.get("origin") !== null;

  if (hasOrigin) {
    if (!provided || !isTenantKeyFormat(provided)) {
      return { ok: false, status: 401, error: "missing_or_malformed_key" };
    }
    if (provided !== config.publicKey) {
      return { ok: false, status: 403, error: "invalid_key" };
    }
    return { ok: true, config };
  }

  // Non-browser path: optional key, but a supplied key must be valid.
  if (provided && provided !== config.publicKey) {
    return { ok: false, status: 403, error: "invalid_key" };
  }
  return { ok: true, config };
}
