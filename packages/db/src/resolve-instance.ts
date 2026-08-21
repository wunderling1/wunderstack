import { and, eq } from "drizzle-orm";

import { getDb } from "./client.js";
import { agentInstances, type AgentInstance } from "./schema/control/agent-instances.js";

/**
 * Control-plane resolution of one embeddable instance (ADR-multitenant-database, track B).
 *
 * Public key → `{ fundKey, agentKey, schemaName, connectionKey }`. Client `fund` / `data-agent`
 * claims are validated against this record and never override it. `connectionKey` is opaque and
 * unused on the request path (ADR D2).
 *
 * Isolation remains D15 (one runtime process = one fund). This module does not SET ROLE.
 * `schemaName` is organizational (search_path); a forgotten set is not permission denied.
 */

export interface ResolvedInstance {
  fundKey: string;
  agentKey: string;
  schemaName: string;
  connectionKey: string | null;
  /** Process tenant id. Under D15 this is 1-to-1 with `fundKey`. */
  tenantId: string;
}

export interface InstanceClaims {
  fund?: string;
  agentKey?: string;
}

export type BindClaimsResult =
  | { ok: true; instance: ResolvedInstance }
  | { ok: false; status: 403; error: "fund_mismatch" | "agent_mismatch" };

export function instanceFromRow(
  row: Pick<AgentInstance, "tenantId" | "agentKey" | "schemaName" | "connectionKey">,
): ResolvedInstance {
  return {
    // Track B / D15: tenant id is the fund key (1-to-1). Do not invent a separate mapping here.
    fundKey: row.tenantId,
    agentKey: row.agentKey,
    schemaName: row.schemaName,
    connectionKey: row.connectionKey,
    tenantId: row.tenantId,
  };
}

/** Public key → instance. Null when the key is unknown (not a secret; uniqueness is the lookup). */
export async function resolveInstanceByPublicKey(publicKey: string): Promise<ResolvedInstance | null> {
  const [row] = await getDb()
    .select({
      tenantId: agentInstances.tenantId,
      agentKey: agentInstances.agentKey,
      schemaName: agentInstances.schemaName,
      connectionKey: agentInstances.connectionKey,
    })
    .from(agentInstances)
    .where(eq(agentInstances.publicKey, publicKey))
    .limit(1);
  return row ? instanceFromRow(row) : null;
}

/**
 * Eval/ingest path: fund + agent_key → instance. Null when no `control.agent_instances` row
 * exists yet (corpus ingest may precede the embed instance).
 */
export async function resolveInstanceByFundAgent(
  fundKey: string,
  agentKey: string,
): Promise<ResolvedInstance | null> {
  const [row] = await getDb()
    .select({
      tenantId: agentInstances.tenantId,
      agentKey: agentInstances.agentKey,
      schemaName: agentInstances.schemaName,
      connectionKey: agentInstances.connectionKey,
    })
    .from(agentInstances)
    .where(and(eq(agentInstances.tenantId, fundKey), eq(agentInstances.agentKey, agentKey)))
    .limit(1);
  return row ? instanceFromRow(row) : null;
}

/**
 * Validate optional client claims against the resolved instance. Mismatch → 403.
 * Matching or omitted claims → the instance values. Never returns the claimed fund/agent
 * when they disagree with the key (test b).
 */
export function bindClaimsToInstance(
  instance: ResolvedInstance,
  claims: InstanceClaims,
): BindClaimsResult {
  if (claims.fund !== undefined && claims.fund !== instance.fundKey) {
    return { ok: false, status: 403, error: "fund_mismatch" };
  }
  if (claims.agentKey !== undefined && claims.agentKey !== instance.agentKey) {
    return { ok: false, status: 403, error: "agent_mismatch" };
  }
  return { ok: true, instance };
}

/** Values the retrieval seam must receive — always from the instance, never from a client claim. */
export function retrievalScope(instance: ResolvedInstance): { fund: string; agentKey: string } {
  return { fund: instance.fundKey, agentKey: instance.agentKey };
}

/**
 * Langfuse tags from a resolved instance. `corpusVersion` comes from `control.agent_config`
 * (passed in by the caller so this module stays free of agent-config parsing).
 */
export function langfuseTagsFromInstance(
  instance: ResolvedInstance,
  extras: { corpusVersion?: string; environment?: string } = {},
): string[] {
  return [
    instance.fundKey,
    instance.agentKey,
    ...(extras.corpusVersion ? [extras.corpusVersion] : []),
    ...(extras.environment ? [extras.environment] : []),
  ];
}
