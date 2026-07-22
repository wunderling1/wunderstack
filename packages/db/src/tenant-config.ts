import { randomBytes } from "node:crypto";
import type { TenantTheme, TenantTexts } from "@wunderstack/shared";
import { eq } from "drizzle-orm";
import { getDb, getWriterDb } from "./client.js";
import { tenantConfig, type TenantConfig } from "./schema.js";

/**
 * Tenant-config data-access (Fase 4). Reads go through the default connection; writes go through the
 * dedicated writer connection (getWriterDb) so the console can theme/rotate keys even when the main
 * connection is read-only in deployment. Public-config parsing (theme/texts → typed) is left to the
 * caller via the Zod schemas in @wunderstack/shared, so this stays a thin data seam.
 */

/** Generate a fresh public tenant-key (`pk_` + url-safe random). Public identifier, not a secret. */
export function generateTenantKey(): string {
  return `pk_${randomBytes(24).toString("base64url")}`;
}

/** Read a tenant's config (null when unconfigured). */
export async function getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  const [row] = await getDb()
    .select()
    .from(tenantConfig)
    .where(eq(tenantConfig.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

/** List all tenant configs (admin console). */
export async function listTenantConfigs(): Promise<TenantConfig[]> {
  return getDb().select().from(tenantConfig).orderBy(tenantConfig.tenantId);
}

export interface TenantConfigInput {
  tenantId: string;
  corsAllowlist?: string[];
  theme?: TenantTheme;
  texts?: TenantTexts;
  agentId?: string;
}

/**
 * Create or update a tenant's config. On first create a public key is generated. Only provided fields
 * are updated; a missing field is left untouched. Writer connection.
 */
export async function upsertTenantConfig(input: TenantConfigInput): Promise<TenantConfig> {
  const db = getWriterDb();
  const existing = await db
    .select({ tenantId: tenantConfig.tenantId })
    .from(tenantConfig)
    .where(eq(tenantConfig.tenantId, input.tenantId))
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(tenantConfig)
      .set({
        ...(input.corsAllowlist !== undefined ? { corsAllowlist: input.corsAllowlist } : {}),
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.texts !== undefined ? { texts: input.texts } : {}),
        ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tenantConfig.tenantId, input.tenantId))
      .returning();
    if (!row) throw new Error(`Failed to update tenant_config for ${input.tenantId}`);
    return row;
  }

  const [row] = await db
    .insert(tenantConfig)
    .values({
      tenantId: input.tenantId,
      publicKey: generateTenantKey(),
      corsAllowlist: input.corsAllowlist ?? [],
      theme: input.theme ?? {},
      texts: input.texts ?? {},
      agentId: input.agentId ?? "cao",
    })
    .returning();
  if (!row) throw new Error(`Failed to insert tenant_config for ${input.tenantId}`);
  return row;
}

/** Rotate a tenant's public key (invalidates old snippets). Returns the new key. Writer connection. */
export async function rotateTenantKey(tenantId: string): Promise<string> {
  const key = generateTenantKey();
  const [row] = await getWriterDb()
    .update(tenantConfig)
    .set({ publicKey: key, updatedAt: new Date() })
    .where(eq(tenantConfig.tenantId, tenantId))
    .returning({ publicKey: tenantConfig.publicKey });
  if (!row) throw new Error(`No tenant_config for tenant ${tenantId}`);
  return row.publicKey;
}
