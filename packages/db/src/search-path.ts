import { sql } from "drizzle-orm";

import { getDb, type Database } from "./client.js";
import { quoteIdent } from "./ident.js";

/**
 * Run `fn` inside a transaction with `SET LOCAL search_path` to one physical schema.
 *
 * Track B (ADR-multitenant-database): this is organizational, not a security boundary.
 * Isolation remains D15 (one runtime process = one fund). There is no SET LOCAL ROLE —
 * CREATE ROLE is not available on the Scalingo addon. A forgotten search_path is not
 * permission denied; it resolves `documents`/`chunks` on the connection default
 * (`public` for extension types; corpus tables live in `fund_*`).
 *
 * `public` stays on the path so pgvector operators (`<=>`) and extension types resolve.
 * Unqualified `documents`/`chunks` still bind to the fund schema first. Do not put a
 * second fund schema on the path (hard invariant: no cross-schema SQL).
 */
export async function withSearchPath<T>(
  schemaName: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL search_path TO ${quoteIdent(schemaName)}, public`));
    return fn(tx as Database);
  });
}

/**
 * Track B name for the organizational fund-schema wrapper. There is no SET LOCAL ROLE —
 * CREATE ROLE is not available on the addon. Callers that need a security boundary use D15
 * (one process = one fund), not this function.
 */
export async function withFundContext<T>(
  schemaName: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return withSearchPath(schemaName, fn);
}
