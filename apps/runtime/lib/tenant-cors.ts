import { listInstances } from "@wunderstack/db";

/**
 * Union of CORS allowlists across every agent instance for this tenant.
 *
 * OPTIONS preflight cannot reliably carry `x-wunderstack-key` (browsers list the header name in
 * Access-Control-Request-Headers, not the value), so we cannot pick a single instance row. Unioning
 * is the safe preflight answer: an origin allowed on *any* instance of this tenant gets ACAO.
 * Authenticated GET/POST still use the instance row that the key resolved.
 */
export async function tenantCorsAllowlist(tenantId: string): Promise<string[]> {
  const instances = await listInstances(tenantId).catch(() => []);
  return [...new Set(instances.flatMap((row) => row.corsAllowlist))];
}
