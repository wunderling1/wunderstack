import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { PassThrough, type Readable } from "node:stream";

import { agentKeySchema, env, tenantThemeSchema, type AgentKey } from "@wunderstack/shared";
import { and, count, desc, eq, sql } from "drizzle-orm";

import { createAgentInstance, getInstance } from "./agent-instances";
import { recordAuditEvent } from "./audit-events";
import { getDb, getProvisionerDb, resolveProvisionerUrl, type Database } from "./client";
import { SCHEMA_NAME_RE, assertFundKey } from "./ident";
import { agentInstances } from "./schema/control/agent-instances";
import { auditEvents } from "./schema/control/audit-events";
import { funds, type Fund } from "./schema/control/funds";

/**
 * Parse stored fund theme jsonb. Corrupt / unknown shapes become `{}` so a bad row cannot crash
 * the config route (F1-04).
 */
export function parseStoredFundTheme(raw: unknown): Record<string, unknown> {
  const parsed = tenantThemeSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return {};
  }
  return parsed.data as Record<string, unknown>;
}

export class FundNotFoundError extends Error {
  readonly fundKey: string;

  constructor(fundKey: string) {
    super(`No fund ${JSON.stringify(fundKey)} in control.funds.`);
    this.name = "FundNotFoundError";
    this.fundKey = fundKey;
  }
}

export class FundInactiveError extends Error {
  readonly fundKey: string;

  constructor(fundKey: string) {
    super(`Fund ${JSON.stringify(fundKey)} is inactive.`);
    this.name = "FundInactiveError";
    this.fundKey = fundKey;
  }
}

export class DumpRequiredError extends Error {
  readonly fundKey: string;

  constructor(fundKey: string) {
    super(
      `Fund ${JSON.stringify(fundKey)} has no fund_dumped audit row. Dump the schema before deactivating.`,
    );
    this.name = "DumpRequiredError";
    this.fundKey = fundKey;
  }
}

export class ConfirmationMismatchError extends Error {
  constructor() {
    super("Typed confirmation does not match the fund key.");
    this.name = "ConfirmationMismatchError";
  }
}

export class AgentInstanceExistsError extends Error {
  readonly fundKey: string;
  readonly agentKey: string;

  constructor(fundKey: string, agentKey: string) {
    super(`Agent instance ${agentKey} already exists for fund ${JSON.stringify(fundKey)}.`);
    this.name = "AgentInstanceExistsError";
    this.fundKey = fundKey;
    this.agentKey = agentKey;
  }
}

export class PgDumpMissingError extends Error {
  constructor() {
    super("pg_dump is not installed or not on PATH. Dump cannot proceed.");
    this.name = "PgDumpMissingError";
  }
}

export class PgDumpFailedError extends Error {
  readonly exitCode: number | null;

  constructor(exitCode: number | null, stderr: string) {
    super(`pg_dump exited ${exitCode ?? "null"}${stderr ? `: ${redactSecrets(stderr)}` : "."}`);
    this.name = "PgDumpFailedError";
    this.exitCode = exitCode;
  }
}

export class FundSchemaMissingError extends Error {
  readonly schemaName: string;

  constructor(schemaName: string) {
    super(`Schema ${JSON.stringify(schemaName)} does not exist; refusing to dump.`);
    this.name = "FundSchemaMissingError";
    this.schemaName = schemaName;
  }
}

/** Strip connection strings so spawn/pg_dump failures never leak credentials in Error.message. */
export function redactSecrets(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
}

/**
 * pg_dump argv without the connection URL (caller passes the URL separately so tests can assert
 * the flags without secrets). Never `--clean`: that would emit DROP SCHEMA in the dump.
 */
export function buildPgDumpArgs(schemaName: string): string[] {
  if (!SCHEMA_NAME_RE.test(schemaName)) {
    throw new Error(`Refusing to dump unsafe schema name: ${JSON.stringify(schemaName)}`);
  }
  return ["--no-owner", "--no-acl", `--schema=${schemaName}`];
}

/**
 * Gate for soft-delete. Pure so unit tests cover the dump-required rule without opening Postgres.
 * Does not DROP SCHEMA (D3) — caller only flips status.
 */
export function assertDeactivateAllowed(input: {
  fund: { key: string; status: string } | null;
  confirmation: string;
  dumpCount: number;
}): { key: string } {
  if (!input.fund) {
    throw new FundNotFoundError(input.confirmation || "(missing)");
  }
  if (input.fund.status !== "active") {
    throw new FundInactiveError(input.fund.key);
  }
  if (input.confirmation !== input.fund.key) {
    throw new ConfirmationMismatchError();
  }
  if (input.dumpCount < 1) {
    throw new DumpRequiredError(input.fund.key);
  }
  return { key: input.fund.key };
}

export async function getFund(fundKey: string, db: Database = getDb()): Promise<Fund | null> {
  const key = assertFundKey(fundKey);
  const [row] = await db.select().from(funds).where(eq(funds.key, key)).limit(1);
  return row ?? null;
}

export type FundDumpAudit = {
  occurredAt: Date;
  bytes: number | null;
  sha256: string | null;
};

export async function getLatestFundDump(
  fundKey: string,
  db: Database = getDb(),
): Promise<FundDumpAudit | null> {
  const key = assertFundKey(fundKey);
  const [row] = await db
    .select({
      occurredAt: auditEvents.occurredAt,
      details: auditEvents.details,
    })
    .from(auditEvents)
    .where(and(eq(auditEvents.fundKey, key), eq(auditEvents.action, "fund_dumped")))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(1);
  if (!row) return null;
  const bytes = typeof row.details.bytes === "number" ? row.details.bytes : null;
  const sha256 = typeof row.details.sha256 === "string" ? row.details.sha256 : null;
  return { occurredAt: row.occurredAt, bytes, sha256 };
}

export async function countFundDumps(fundKey: string, db: Database = getDb()): Promise<number> {
  const key = assertFundKey(fundKey);
  const [row] = await db
    .select({ n: count() })
    .from(auditEvents)
    .where(and(eq(auditEvents.fundKey, key), eq(auditEvents.action, "fund_dumped")));
  return Number(row?.n ?? 0);
}

export async function updateFundDisplayName(input: { fundKey: string; name: string }): Promise<Fund> {
  const key = assertFundKey(input.fundKey);
  const name = input.name.trim();
  if (!name) {
    throw new Error("Fund display name is required.");
  }
  const [row] = await getProvisionerDb()
    .update(funds)
    .set({ name })
    .where(eq(funds.key, key))
    .returning();
  if (!row) {
    throw new FundNotFoundError(key);
  }
  return row;
}

/** Read fund-level theme (reader connection). Empty object when unset or corrupt. */
export async function getFundTheme(
  fundKey: string,
  db: Database = getDb(),
): Promise<Record<string, unknown>> {
  const fund = await getFund(fundKey, db);
  if (!fund) {
    throw new FundNotFoundError(assertFundKey(fundKey));
  }
  return parseStoredFundTheme(fund.theme);
}

/** Write fund-level theme (provisioner — control.*). Validates with tenantThemeSchema. */
export async function updateFundTheme(input: {
  fundKey: string;
  theme: Record<string, unknown>;
}): Promise<Fund> {
  const key = assertFundKey(input.fundKey);
  const theme = tenantThemeSchema.parse(input.theme);
  const [row] = await getProvisionerDb()
    .update(funds)
    .set({ theme })
    .where(eq(funds.key, key))
    .returning();
  if (!row) {
    throw new FundNotFoundError(key);
  }
  return row;
}

export interface AddedAgentInstance {
  agentKey: AgentKey;
  publicKey: string;
}

/**
 * Add an agent instance to an existing active fund. Refuses if the fund is missing/inactive or the
 * (tenant, agent) pair already exists — no half-fund insert on a fund that was never provisioned.
 */
export async function addFundAgent(input: {
  fundKey: string;
  agentKey: string;
}): Promise<AddedAgentInstance> {
  const fundKey = assertFundKey(input.fundKey);
  const parsed = agentKeySchema.safeParse(input.agentKey);
  if (!parsed.success) {
    throw new Error(`Invalid agent key: ${JSON.stringify(input.agentKey)}`);
  }
  const agentKey = parsed.data;

  const fund = await getFund(fundKey);
  if (!fund) {
    throw new FundNotFoundError(fundKey);
  }
  if (fund.status !== "active") {
    throw new FundInactiveError(fundKey);
  }

  const existing = await getInstance(fundKey, agentKey);
  if (existing) {
    throw new AgentInstanceExistsError(fundKey, agentKey);
  }

  try {
    const row = await createAgentInstance({ tenantId: fundKey, agentKey });
    return { agentKey, publicKey: row.publicKey };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "23505") {
      throw new AgentInstanceExistsError(fundKey, agentKey);
    }
    throw error;
  }
}

export interface FundDumpStream {
  fundKey: string;
  schemaName: string;
  stream: Readable;
  /** Settles when pg_dump exits. On success, a fund_dumped audit row has been written. */
  completed: Promise<{ bytes: number; sha256: string }>;
}

/**
 * Spawn `pg_dump --no-owner --no-acl --schema=fund_<key>`. Streams SQL to the caller; records
 * `fund_dumped` with `{ bytes, sha256 }` only — never the dump body or corpus text.
 * Missing `pg_dump` → PgDumpMissingError (fail visibly; do not pretend metadata is a dump).
 */
export async function openFundDump(fundKey: string): Promise<FundDumpStream> {
  const key = assertFundKey(fundKey);
  const fund = await getFund(key);
  if (!fund) {
    throw new FundNotFoundError(key);
  }

  const schemaName = fund.schemaName;
  const exists = await fundSchemaExists(schemaName);
  if (!exists) {
    throw new FundSchemaMissingError(schemaName);
  }

  const url = resolveProvisionerUrl(env.PROVISIONER_DATABASE_URL);
  const child = spawn("pg_dump", [...buildPgDumpArgs(schemaName), url], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new PgDumpMissingError());
        return;
      }
      reject(error);
    });
    child.once("spawn", () => resolve());
  });

  if (!child.stdout) {
    throw new Error("pg_dump stdout is not available.");
  }

  const hash = createHash("sha256");
  let bytes = 0;
  const out = new PassThrough();
  child.stdout.on("data", (chunk: Buffer) => {
    hash.update(chunk);
    bytes += chunk.length;
  });
  child.stdout.pipe(out);

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 4000) {
      stderr = stderr.slice(-4000);
    }
  });

  const completed = new Promise<{ bytes: number; sha256: string }>((resolve, reject) => {
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new PgDumpFailedError(code, stderr));
        return;
      }
      const sha256 = hash.digest("hex");
      void recordAuditEvent(
        {
          action: "fund_dumped",
          fundKey: key,
          actor: "dashboard",
          details: { bytes, sha256, schemaName },
        },
        getProvisionerDb(),
      ).then(() => resolve({ bytes, sha256 }), reject);
    });
  });

  return { fundKey: key, schemaName, stream: out, completed };
}

async function fundSchemaExists(schemaName: string): Promise<boolean> {
  const rows = (await getDb().execute(
    sql`select 1 as ok from information_schema.schemata where schema_name = ${schemaName} limit 1`,
  )) as unknown as Array<{ ok: number }>;
  return rows.length > 0;
}

/**
 * Soft-delete: `control.funds.status = inactive` and matching agent instances. Schema stays
 * (no DROP — D3; provisioner must not get DROP). Requires a prior `fund_dumped` audit row.
 */
export async function deactivateFund(input: {
  fundKey: string;
  confirmation: string;
}): Promise<Fund> {
  const key = assertFundKey(input.fundKey);
  const fund = await getFund(key);
  const dumpCount = await countFundDumps(key);
  assertDeactivateAllowed({ fund, confirmation: input.confirmation, dumpCount });
  const latest = await getLatestFundDump(key);

  return getProvisionerDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(funds)
      .set({ status: "inactive" })
      .where(and(eq(funds.key, key), eq(funds.status, "active")))
      .returning();
    if (!updated) {
      throw new FundInactiveError(key);
    }

    await tx
      .update(agentInstances)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(agentInstances.tenantId, key));

    await recordAuditEvent(
      {
        action: "fund_deactivated",
        fundKey: key,
        actor: "dashboard",
        details: {
          schemaName: updated.schemaName,
          dumpSha256: latest?.sha256 ?? null,
        },
      },
      tx as unknown as Database,
    );

    return updated;
  });
}
