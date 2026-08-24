import { randomBytes } from "node:crypto";
import type { TenantTheme, TenantTexts } from "@wunderstack/shared";
import { and, eq } from "drizzle-orm";

import { getDb, getWriterDb } from "./client.js";
import { agentInstances, type AgentInstance } from "./schema/control/agent-instances.js";

/**
 * Agent-instance data-access (control.agent_instances). Each row is one embeddable instance
 * (tenant × agent_key) with its own public key. Reads use the default connection; writes use the
 * writer connection.
 */

/** Physical fund schema name for a tenant key (`fund_oomt`). */
export function fundSchemaName(tenantId: string): string {
  return `fund_${tenantId}`;
}

/** Generate a fresh public tenant-key (`pk_` + url-safe random). Public identifier, not a secret. */
export function generateTenantKey(): string {
  return `pk_${randomBytes(24).toString("base64url")}`;
}

/** Read one agent instance for a tenant (null when unconfigured). */
export async function getInstance(tenantId: string, agentKey: string): Promise<AgentInstance | null> {
  const [row] = await getDb()
    .select()
    .from(agentInstances)
    .where(and(eq(agentInstances.tenantId, tenantId), eq(agentInstances.agentKey, agentKey)))
    .limit(1);
  return row ?? null;
}

/**
 * Back-compat: return the CAO instance for a tenant (most admin paths still target one row).
 * Prefer `getInstance` / `listInstances` when the agent matters.
 */
export async function getTenantConfig(tenantId: string): Promise<AgentInstance | null> {
  return getInstance(tenantId, "cao");
}

/** Resolve an instance by its public embed key (unique across instances). */
export async function getInstanceByPublicKey(publicKey: string): Promise<AgentInstance | null> {
  const [row] = await getDb()
    .select()
    .from(agentInstances)
    .where(eq(agentInstances.publicKey, publicKey))
    .limit(1);
  return row ?? null;
}

/** List all instances for a tenant. */
export async function listInstances(tenantId: string): Promise<AgentInstance[]> {
  return getDb()
    .select()
    .from(agentInstances)
    .where(eq(agentInstances.tenantId, tenantId))
    .orderBy(agentInstances.agentKey);
}

/** List all agent instances (admin console). */
export async function listTenantConfigs(): Promise<AgentInstance[]> {
  return getDb()
    .select()
    .from(agentInstances)
    .orderBy(agentInstances.tenantId, agentInstances.agentKey);
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
export async function upsertTenantConfig(input: TenantConfigInput): Promise<AgentInstance> {
  const agentKey = input.agentKey ?? "cao";
  const db = getWriterDb();
  const existing = await db
    .select({ tenantId: agentInstances.tenantId })
    .from(agentInstances)
    .where(and(eq(agentInstances.tenantId, input.tenantId), eq(agentInstances.agentKey, agentKey)))
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(agentInstances)
      .set({
        ...(input.corsAllowlist !== undefined ? { corsAllowlist: input.corsAllowlist } : {}),
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.texts !== undefined ? { texts: input.texts } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(agentInstances.tenantId, input.tenantId), eq(agentInstances.agentKey, agentKey)))
      .returning();
    if (!row) throw new Error(`Failed to update agent instance for ${input.tenantId}/${agentKey}`);
    return row;
  }

  const [row] = await db
    .insert(agentInstances)
    .values({
      tenantId: input.tenantId,
      agentKey,
      publicKey: generateTenantKey(),
      schemaName: fundSchemaName(input.tenantId),
      status: "active",
      corsAllowlist: input.corsAllowlist ?? [],
      theme: input.theme ?? {},
      texts: input.texts ?? {},
    })
    .returning();
  if (!row) throw new Error(`Failed to insert agent instance for ${input.tenantId}/${agentKey}`);
  return row;
}

/** Rotate an instance's public key (invalidates old snippets). Writer connection. */
export async function rotateTenantKey(tenantId: string, agentKey = "cao"): Promise<string> {
  const key = generateTenantKey();
  const [row] = await getWriterDb()
    .update(agentInstances)
    .set({ publicKey: key, updatedAt: new Date() })
    .where(and(eq(agentInstances.tenantId, tenantId), eq(agentInstances.agentKey, agentKey)))
    .returning({ publicKey: agentInstances.publicKey });
  if (!row) throw new Error(`No agent instance for tenant ${tenantId} agent ${agentKey}`);
  return row.publicKey;
}

export type TenantConfig = AgentInstance;
export type { AgentInstance };
