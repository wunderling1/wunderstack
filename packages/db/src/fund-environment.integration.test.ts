import assert from "node:assert/strict";
import { inspect } from "node:util";
import { after, describe, it } from "node:test";

import { closeDb, eq, funds, getDb, sql, users } from "./index";
import { createFundEnvironment, FundExistsError } from "./fund-environment";
import { UserExistsError } from "./dashboard-users";

/**
 * Requires PROVISIONER_DATABASE_URL (and DATABASE_URL for cleanup reads) at process start —
 * @wunderstack/shared parses env once. Local: set both to the same URL.
 */
const provisionerSet = Boolean(process.env.PROVISIONER_DATABASE_URL);
const hasDb = Boolean(process.env.DATABASE_URL);

describe("createFundEnvironment (integration)", { skip: !provisionerSet || !hasDb }, () => {
  const fundKey = `proef-${Date.now().toString(36)}`;
  const email = `admin@${fundKey}.test`;

  after(async () => {
    try {
      const db = getDb();
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "fund_${fundKey}" CASCADE`));
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "fund_${fundKey}-b" CASCADE`));
      await db.delete(users).where(eq(users.tenantId, fundKey));
      await db.delete(users).where(eq(users.email, email));
      await db.delete(funds).where(eq(funds.key, fundKey));
      await db.delete(funds).where(eq(funds.key, `${fundKey}-b`));
    } finally {
      await closeDb();
    }
  });

  it("creates funds row, schema with three tables, and distinct agent publicKeys", async () => {
    const result = await createFundEnvironment({
      fundKey,
      name: "Proefonds",
      agentKeys: ["cao", "arbo"],
      user: {
        email,
        passwordHash: "scrypt$testsalt$testhash",
      },
    });

    assert.equal(result.fundKey, fundKey);
    assert.equal(result.instances.length, 2);
    assert.notEqual(result.instances[0]?.publicKey, result.instances[1]?.publicKey);

    const tables = (await getDb().execute(
      sql.raw(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'fund_${fundKey}'
          AND table_name IN ('documents', 'chunks', 'interaction_events')
        ORDER BY table_name
      `),
    )) as unknown as Array<{ table_name: string }>;
    assert.deepEqual(
      tables.map((row) => row.table_name),
      ["chunks", "documents", "interaction_events"],
    );
  });

  it("FundExistsError when the key is already registered", async () => {
    await assert.rejects(
      () =>
        createFundEnvironment({
          fundKey,
          name: "Again",
          agentKeys: ["cao"],
        }),
      (error: unknown) => error instanceof FundExistsError,
    );
  });

  it("UserExistsError rolls back: no control.funds row and no schema for the new key", async () => {
    const otherKey = `${fundKey}-b`;
    await assert.rejects(
      () =>
        createFundEnvironment({
          fundKey: otherKey,
          name: "Other",
          agentKeys: ["cao"],
          user: { email, passwordHash: "scrypt$x$y" },
        }),
      (error: unknown) => error instanceof UserExistsError,
    );

    const orphanFund = await getDb()
      .select({ key: funds.key })
      .from(funds)
      .where(eq(funds.key, otherKey));
    assert.equal(orphanFund.length, 0);

    const orphanSchema = (await getDb().execute(
      sql.raw(
        `SELECT 1 AS ok FROM information_schema.schemata WHERE schema_name = 'fund_${otherKey}'`,
      ),
    )) as unknown as Array<{ ok: number }>;
    assert.equal(orphanSchema.length, 0);
  });

  it("rejects invalid outcome at the DB CHECK after provision", async () => {
    const checkKey = `proef-check-${Date.now().toString(36)}`;
    const schema = `fund_${checkKey}`;
    await createFundEnvironment({
      fundKey: checkKey,
      name: "CHECK test",
      agentKeys: ["cao"],
    });

    try {
      try {
        await getDb().execute(
          sql.raw(`
            INSERT INTO "${schema}".interaction_events (
              tenant_id, agent_id, fund, session_id, outcome
            ) VALUES ('t', 'cao', '${checkKey}', 's', 'bogus')
          `),
        );
        assert.fail("INSERT of outcome=bogus should have been rejected");
      } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
        assert.ok(
          isOutcomeCheckViolation(error),
          `expected CHECK violation, got: ${inspect(error, { depth: 8 })}`,
        );
      }
    } finally {
      await getDb().execute(sql.raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
      await getDb().delete(funds).where(eq(funds.key, checkKey));
    }
  });
});

/**
 * Drizzle wraps the driver error as `Failed query: <sql>`. Postgres lives on `cause`
 * (postgres.js: `code`, `constraint`; node-pg: `constraint_name`). Inspect the chain, not
 * the outer message.
 */
function isOutcomeCheckViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      if (record.constraint === "interaction_events_outcome_check") return true;
      if (record.constraint_name === "interaction_events_outcome_check") return true;
      if (record.code === "23514") return true;
    }
    const message = current instanceof Error ? current.message : String(current);
    if (
      message.includes("interaction_events_outcome_check") ||
      message.includes("check constraint")
    ) {
      return true;
    }
    current =
      current instanceof Error
        ? current.cause
        : typeof current === "object" && current !== null && "cause" in current
          ? current.cause
          : undefined;
  }
  return /interaction_events_outcome_check|check constraint|\b23514\b/.test(
    inspect(error, { depth: 8, breakLength: Infinity }),
  );
}

describe("isOutcomeCheckViolation", () => {
  it("does not match a Drizzle Failed query wrapper by message alone", () => {
    assert.equal(isOutcomeCheckViolation(new Error("Failed query: INSERT INTO …")), false);
  });

  it("matches postgres.js constraint / 23514 on the cause chain", () => {
    const root = Object.assign(
      new Error('new row violates check constraint "interaction_events_outcome_check"'),
      { code: "23514", constraint: "interaction_events_outcome_check" },
    );
    const wrapped = new Error("Failed query: INSERT INTO …", { cause: root });
    assert.equal(isOutcomeCheckViolation(wrapped), true);
  });
});
