import { randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";

import { getDb, getWriterDb } from "./client.js";
import { assertFundKey } from "./ident.js";
import { lti11Consumers, type Lti11Consumer } from "./schema/control/lti11-consumers.js";
import { lti11Launches, type Lti11Launch } from "./schema/control/lti11-launches.js";
import { lti11Nonces } from "./schema/control/lti11-nonces.js";

/**
 * LTI 1.1 data-access (control plane). Consumers are admin-written via the tenant-config writer;
 * nonces and launches are written by the runtime on DATABASE_URL during a launch POST.
 *
 * There is no user-mapping table. `lti_user_id` on a launch is an opaque pseudonym (R3).
 */

export const LTI11_LAUNCH_TTL_MS = 4 * 60 * 60 * 1000;

export class ConsumerKeyTakenError extends Error {
  readonly consumerKey: string;

  constructor(consumerKey: string) {
    super(`LTI 1.1 consumer key ${JSON.stringify(consumerKey)} is already in use.`);
    this.name = "ConsumerKeyTakenError";
    this.consumerKey = consumerKey;
  }
}

export class Lti11ConsumerNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`No LTI 1.1 consumer ${JSON.stringify(id)}.`);
    this.name = "Lti11ConsumerNotFoundError";
    this.id = id;
  }
}

/** Public view: the shared secret is write-only after create. */
export type Lti11ConsumerPublic = Omit<Lti11Consumer, "consumerSecret">;

export function toPublicConsumer(row: Lti11Consumer): Lti11ConsumerPublic {
  return {
    id: row.id,
    fundKey: row.fundKey,
    name: row.name,
    consumerKey: row.consumerKey,
    status: row.status,
    gradePassbackEnabled: row.gradePassbackEnabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function generateLti11Credentials(): { consumerKey: string; consumerSecret: string } {
  return {
    consumerKey: `lti11_${randomBytes(12).toString("hex")}`,
    consumerSecret: randomBytes(32).toString("hex"),
  };
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  return code === "23505";
}

/** postgres.js returns an array; other drivers wrap rows. Exported for the unit test of that seam. */
export function claimedFromExecute(result: unknown): boolean {
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows: unknown }).rows)
      ? (result as { rows: unknown[] }).rows
      : [];
  const row = rows[0];
  if (!row || typeof row !== "object") {
    return false;
  }
  const claimed = (row as { claimed?: unknown }).claimed;
  return claimed === true || claimed === "t" || claimed === "true";
}

export async function listLti11Consumers(fundKey: string): Promise<Lti11ConsumerPublic[]> {
  const key = assertFundKey(fundKey);
  const rows = await getDb()
    .select()
    .from(lti11Consumers)
    .where(eq(lti11Consumers.fundKey, key))
    .orderBy(lti11Consumers.createdAt);
  return rows.map(toPublicConsumer);
}

export async function getActiveLti11ConsumerByKey(
  consumerKey: string,
): Promise<Lti11Consumer | null> {
  const [row] = await getDb()
    .select()
    .from(lti11Consumers)
    .where(and(eq(lti11Consumers.consumerKey, consumerKey), eq(lti11Consumers.status, "active")))
    .limit(1);
  return row ?? null;
}

/** Includes the secret — only the outcomes adapter should call this. */
export async function getLti11ConsumerForDelivery(id: string): Promise<Lti11Consumer | null> {
  const [row] = await getDb().select().from(lti11Consumers).where(eq(lti11Consumers.id, id)).limit(1);
  return row ?? null;
}

export async function createLti11Consumer(input: {
  fundKey: string;
  name: string;
  consumerKey: string;
  consumerSecret: string;
  gradePassbackEnabled: boolean;
}): Promise<{ consumer: Lti11ConsumerPublic; consumerSecret: string }> {
  const fundKey = assertFundKey(input.fundKey);
  try {
    const [row] = await getWriterDb()
      .insert(lti11Consumers)
      .values({
        fundKey,
        name: input.name,
        consumerKey: input.consumerKey,
        consumerSecret: input.consumerSecret,
        gradePassbackEnabled: input.gradePassbackEnabled,
      })
      .returning();
    if (!row) {
      throw new Error("createLti11Consumer returned no row");
    }
    return { consumer: toPublicConsumer(row), consumerSecret: row.consumerSecret };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConsumerKeyTakenError(input.consumerKey);
    }
    throw error;
  }
}

export async function deactivateLti11Consumer(fundKey: string, id: string): Promise<Lti11ConsumerPublic> {
  const key = assertFundKey(fundKey);
  const [row] = await getWriterDb()
    .update(lti11Consumers)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(and(eq(lti11Consumers.fundKey, key), eq(lti11Consumers.id, id)))
    .returning();
  if (!row) {
    throw new Lti11ConsumerNotFoundError(id);
  }
  return toPublicConsumer(row);
}

export async function setLti11GradePassback(
  fundKey: string,
  id: string,
  enabled: boolean,
): Promise<Lti11ConsumerPublic> {
  const key = assertFundKey(fundKey);
  const [row] = await getWriterDb()
    .update(lti11Consumers)
    .set({ gradePassbackEnabled: enabled, updatedAt: new Date() })
    .where(and(eq(lti11Consumers.fundKey, key), eq(lti11Consumers.id, id)))
    .returning();
  if (!row) {
    throw new Lti11ConsumerNotFoundError(id);
  }
  return toPublicConsumer(row);
}

/**
 * Atomic nonce claim. True iff this call inserted the row. False is a replay (or a DB error that
 * we treat as a replay rather than retrying into a duplicate).
 */
export async function acquireLti11Nonce(consumerKey: string, nonce: string): Promise<boolean> {
  const result = await getDb().execute(
    sql`SELECT control.acquire_lti11_nonce(${consumerKey}, ${nonce}) AS claimed`,
  );
  return claimedFromExecute(result);
}

/**
 * Release a claimed nonce so a browser retry of a launch that failed after the claim is not treated
 * as a replay. Matches Qonvo `releaseLti11Nonce` (handler.ts ~146–154 / 258–263).
 */
export async function releaseLti11Nonce(consumerKey: string, nonce: string): Promise<void> {
  await getDb()
    .delete(lti11Nonces)
    .where(and(eq(lti11Nonces.consumerKey, consumerKey), eq(lti11Nonces.nonce, nonce)));
}

export async function insertLti11Launch(input: {
  consumerId: string;
  ltiUserId: string;
  resourceLinkId: string | null;
  contextId: string | null;
  outcomeServiceUrl: string | null;
  resultSourcedId: string | null;
  scenarioSlug: string;
  now?: Date;
}): Promise<Lti11Launch | null> {
  const now = input.now ?? new Date();
  const [row] = await getDb()
    .insert(lti11Launches)
    .values({
      consumerId: input.consumerId,
      ltiUserId: input.ltiUserId,
      resourceLinkId: input.resourceLinkId,
      contextId: input.contextId,
      outcomeServiceUrl: input.outcomeServiceUrl,
      resultSourcedId: input.resultSourcedId,
      scenarioSlug: input.scenarioSlug,
      expiresAt: new Date(now.getTime() + LTI11_LAUNCH_TTL_MS),
    })
    .returning();
  return row ?? null;
}

export interface Lti11LaunchAuth {
  launch: Lti11Launch;
  consumer: Lti11Consumer;
}

export async function getUnexpiredLti11Launch(id: string, now = new Date()): Promise<Lti11LaunchAuth | null> {
  const [row] = await getDb()
    .select({
      launch: lti11Launches,
      consumer: lti11Consumers,
    })
    .from(lti11Launches)
    .innerJoin(lti11Consumers, eq(lti11Launches.consumerId, lti11Consumers.id))
    .where(and(eq(lti11Launches.id, id), gt(lti11Launches.expiresAt, now)))
    .limit(1);
  if (!row || row.consumer.status !== "active") {
    return null;
  }
  return row;
}

/**
 * Mark a launch consumed on the first successful roleplay start. Returns false when another start
 * already used this launch — the caller must refuse so two sessions cannot replaceResult the same
 * LMS grade.
 */
export async function consumeLti11Launch(id: string, now = new Date()): Promise<boolean> {
  const updated = await getDb()
    .update(lti11Launches)
    .set({ consumedAt: now })
    .where(and(eq(lti11Launches.id, id), sql`${lti11Launches.consumedAt} IS NULL`))
    .returning({ id: lti11Launches.id });
  return updated.length > 0;
}
