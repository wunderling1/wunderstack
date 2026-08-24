import { z } from "zod";

/**
 * Tenant context (D15, track B). One runtime process = one tenant = one fund:
 *   - `tenant` is the deployment/instance identity, taken from the `TENANT` env var
 *     (e.g. `oomt`, `demo`). It is the technical key.
 *   - `fund` is the domain word used in customer context. `tenantFund()` maps a tenant to it.
 *
 * Tenant zero is the demo instance (`TENANT=demo`), whose fund is the demo corpus.
 * The control plane may know many funds; this package stays the process boundary until
 * CREATE ROLE exists (ADR-multitenant-database). Do not collapse D15.
 *
 * Env is parsed once here via Zod (see .cursor/rules/300-typescript.mdc): a single typed source
 * of truth for tenant identity, so no app hardcodes a tenant/fund literal.
 */

/** Fallback tenant for local dev when `TENANT` is unset. Keeps single-tenant dev parity. */
const DEV_DEFAULT_TENANT = "demo";

const tenantEnvSchema = z.object({
  /** Instance identity. Unset locally → dev default tenant. */
  TENANT: z.string().min(1).optional(),
  /** Optional explicit fund override for this tenant; otherwise derived from the tenant. */
  TENANT_FUND: z.string().min(1).optional(),
});

export type TenantId = string;

export interface TenantContext {
  /** The deployment/instance identity (technical key). */
  tenant: TenantId;
  /** The fund (customer-domain word) this tenant serves. */
  fund: string;
}

/**
 * Explicit tenant → fund mapping. Extend per instance. Unknown tenants map to a fund of the same
 * name (1-to-1 convention), so a new instance works by setting `TENANT` alone.
 */
const TENANT_FUND: Record<string, string> = {
  demo: "demo",
};

function parseTenantEnv(env: NodeJS.ProcessEnv): z.infer<typeof tenantEnvSchema> {
  return tenantEnvSchema.parse({
    TENANT: env.TENANT,
    TENANT_FUND: env.TENANT_FUND,
  });
}

/** The current instance's tenant id, from `TENANT` (dev default when unset). */
export function getTenantId(env: NodeJS.ProcessEnv = process.env): TenantId {
  const parsed = parseTenantEnv(env);
  return parsed.TENANT ?? DEV_DEFAULT_TENANT;
}

/** The fund a tenant serves: explicit `TENANT_FUND` → mapping → tenant id (1-to-1 convention). */
export function tenantFund(tenant: TenantId, env: NodeJS.ProcessEnv = process.env): string {
  const parsed = parseTenantEnv(env);
  return parsed.TENANT_FUND ?? TENANT_FUND[tenant] ?? tenant;
}

/** Resolve the full tenant context for the current instance. */
export function resolveTenant(env: NodeJS.ProcessEnv = process.env): TenantContext {
  const tenant = getTenantId(env);
  return { tenant, fund: tenantFund(tenant, env) };
}

/** The default fund for the current instance (used where a concrete fund is always required). */
export function defaultFund(env: NodeJS.ProcessEnv = process.env): string {
  return resolveTenant(env).fund;
}
