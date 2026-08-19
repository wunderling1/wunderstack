import { randomBytes } from "node:crypto";
import type { TenantTheme, TenantTexts } from "@wunderstack/shared";
import { and, eq } from "drizzle-orm";
import { getDb, getWriterDb } from "./client.js";
import { tenantConfig, type TenantConfig } from "./schema.js";

/**
 * Tenant agent-instance data-access (Fase 4 + second agent). Each row is one embeddable instance
 * (tenant × agent_key) with its own public key. Reads use the default connection; writes use the
 * writer connection.
 */

/** Generate a fresh public tenant-key (`pk_` + url-safe random). Public identifier, not a secret. */
export function generateTenantKey(): string {
  return `pk_${randomBytes(24).toString("base64url")}`;
}

/** Read one agent instance for a tenant (null when unconfigured). */
export async function getInstance(tenantId: string, agentKey: string): Promise<TenantConfig | null> {
  const [row] = await getDb()
    .select()
    .from(tenantConfig)
    .where(and(eq(tenantConfig.tenantId, tenantId), eq(tenantConfig.agentKey, agentKey)))
    .limit(1);
  return row ?? null;
}

/**
 * Back-compat: return the CAO instance for a tenant (most admin paths still target one row).
 * Prefer `getInstance` / `listInstances` when the agent matters.
 */
export async function getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  return getInstance(tenantId, "cao");
}

/** Resolve an instance by its public embed key (unique across instances). */
export async function getInstanceByPublicKey(publicKey: string): Promise<TenantConfig | null> {
  const [row] = await getDb()
    .select()
    .from(tenantConfig)
    .where(eq(tenantConfig.publicKey, publicKey))
    .limit(1);
  return row ?? null;
}

/** List all instances for a tenant. */
export async function listInstances(tenantId: string): Promise<TenantConfig[]> {
  return getDb()
    .select()
    .from(tenantConfig)
    .where(eq(tenantConfig.tenantId, tenantId))
    .orderBy(tenantConfig.agentKey);
}

/** List all tenant instances (admin console). */
export async function listTenantConfigs(): Promise<TenantConfig[]> {
  return getDb().select().from(tenantConfig).orderBy(tenantConfig.tenantId, tenantConfig.agentKey);
}

export interface TenantConfigInput {
  tenantId: string;
  agentKey?: string;
  corsAllowlist?: string[];
  theme?: TenantTheme;
  texts?: TenantTexts;
}

/**
 * Create or update an agent instance. On first create a public key is generated. Only provided fields
 * are updated; missing fields are left untouched. Writer connection.
 */
export async function upsertTenantConfig(input: TenantConfigInput): Promise<TenantConfig> {
  const agentKey = input.agentKey ?? "cao";
  const db = getWriterDb();
  const existing = await db
    .select({ tenantId: tenantConfig.tenantId })
    .from(tenantConfig)
    .where(and(eq(tenantConfig.tenantId, input.tenantId), eq(tenantConfig.agentKey, agentKey)))
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(tenantConfig)
      .set({
        ...(input.corsAllowlist !== undefined ? { corsAllowlist: input.corsAllowlist } : {}),
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.texts !== undefined ? { texts: input.texts } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(tenantConfig.tenantId, input.tenantId), eq(tenantConfig.agentKey, agentKey)))
      .returning();
    if (!row) throw new Error(`Failed to update tenant_config for ${input.tenantId}/${agentKey}`);
    return row;
  }

  const [row] = await db
    .insert(tenantConfig)
    .values({
      tenantId: input.tenantId,
      agentKey,
      publicKey: generateTenantKey(),
      corsAllowlist: input.corsAllowlist ?? [],
      theme: input.theme ?? {},
      texts: input.texts ?? {},
    })
    .returning();
  if (!row) throw new Error(`Failed to insert tenant_config for ${input.tenantId}/${agentKey}`);
  return row;
}

/** Rotate an instance's public key (invalidates old snippets). Writer connection. */
export async function rotateTenantKey(tenantId: string, agentKey = "cao"): Promise<string> {
  const key = generateTenantKey();
  const [row] = await getWriterDb()
    .update(tenantConfig)
    .set({ publicKey: key, updatedAt: new Date() })
    .where(and(eq(tenantConfig.tenantId, tenantId), eq(tenantConfig.agentKey, agentKey)))
    .returning({ publicKey: tenantConfig.publicKey });
  if (!row) throw new Error(`No tenant_config for tenant ${tenantId} agent ${agentKey}`);
  return row.publicKey;
}
