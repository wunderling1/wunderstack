import { randomBytes } from "node:crypto";
import type { TenantTheme, TenantTexts } from "@wunderstack/shared";
import { and, eq } from "drizzle-orm";

import { getDb, getWriterDb } from "./client";
import { agentInstances, type AgentInstance } from "./schema/control/agent-instances";

/**
 * Agent-instance data-access (control.agent_instances). Each row is one embeddable instance
 * (tenant × agent_key) with its own public key. Reads use the default connection; writes use the
 * writer connection.
 */

/**
 * Physical fund schema name for a tenant/fund key (`fund_oomt`).
 * Single assembler for `fund_<key>` — callers must not invent a second prefix formula.
 */
export function fundSchemaName(tenantId: string): string {
  return `fund_${tenantId}`;
}

/**
 * Stored `control.funds.schema_name` / instance `schema_name` is a denormalized copy of
 * `fundSchemaName(key)`, never a second formula. Throws when a row drifted.
 */
export function assertStoredSchemaName(fundKey: string, schemaName: string): string {
  const expected = fundSchemaName(fundKey);
  if (schemaName !== expected) {
    throw new Error(
      `Stored schema_name ${JSON.stringify(schemaName)} does not match ` +
        `fundSchemaName(${JSON.stringify(fundKey)}) = ${JSON.stringify(expected)}.`,
    );
  }
  return schemaName;
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
 * Back-compat aliases removed (F1-03): use `getInstance(tenantId, agentKey)` instead of a
 * CAO-only `getTenantConfig` name that lied about "the" tenant config.
 */

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
  /** @deprecated Theme lives on control.funds (S1). Ignored by updateTenantConfig. */
  theme?: TenantTheme;
  texts?: TenantTexts;
}

/**
 * Update an existing agent instance. Does **not** insert — fund onboarding creates rows via
 * createFundEnvironment; the OOMT seed uses createAgentInstance. Writer connection.
 * Theme is not written here (fund-level via updateFundTheme).
 */
export async function updateTenantConfig(input: TenantConfigInput): Promise<AgentInstance> {
  const agentKey = input.agentKey ?? "cao";
  const db = getWriterDb();
  const [row] = await db
    .update(agentInstances)
    .set({
      ...(input.corsAllowlist !== undefined ? { corsAllowlist: input.corsAllowlist } : {}),
      ...(input.texts !== undefined ? { texts: input.texts } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(agentInstances.tenantId, input.tenantId), eq(agentInstances.agentKey, agentKey)))
    .returning();
  if (!row) {
    throw new Error(
      `No agent instance for ${input.tenantId}/${agentKey}. Create the fund via /admin/funds first.`,
    );
  }
  return row;
}

/**
 * @deprecated Prefer createFundEnvironment (dashboard) or createAgentInstance (seed). Kept as an
 * alias of updateTenantConfig so callers that only update keep compiling; insert is no longer
 * performed here (closes the half-fund path).
 */
export async function upsertTenantConfig(input: TenantConfigInput): Promise<AgentInstance> {
  return updateTenantConfig(input);
}

/**
 * Insert a new agent instance. Dashboard uses addFundAgent (checks the fund is active first).
 * Seed scripts may call this directly.
 */
export async function createAgentInstance(input: TenantConfigInput): Promise<AgentInstance> {
  const agentKey = input.agentKey ?? "cao";
  const db = getWriterDb();
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

/** Pin the corpus/release tag the fund approved. Existing column — not a new field (D9). */
export async function pinInstanceReleaseTag(
  tenantId: string,
  agentKey: string,
  tag: string,
): Promise<void> {
  const [row] = await getWriterDb()
    .update(agentInstances)
    .set({ pinnedReleaseTag: tag, updatedAt: new Date() })
    .where(and(eq(agentInstances.tenantId, tenantId), eq(agentInstances.agentKey, agentKey)))
    .returning({ pinnedReleaseTag: agentInstances.pinnedReleaseTag });
  if (!row) {
    throw new Error(`No agent instance for ${tenantId}/${agentKey}.`);
  }
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
