import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { closeDb, eq, funds, getDb, sql, users } from "./index.js";
import { createFundEnvironment, FundExistsError } from "./fund-environment.js";
import { UserExistsError } from "./dashboard-users.js";

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
});
