import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import {
  closeDb,
  createFundEnvironment,
  eq,
  funds,
  getDb,
  listActiveFunds,
  sql,
  users,
} from "@wunderstack/db";
import { answeredGrounded } from "@wunderstack/shared";
import { getAgentActivity, getCorpusOverview, getKpiSummary, listOutcomeActivity, measurementStartedAt } from "./index.js";
import { recordInteractionEvent } from "./record.js";

/**
 * Requires PROVISIONER_DATABASE_URL + DATABASE_URL at process start (shared env parse).
 * GATE_DB / local: set both to the same Postgres URL.
 */
const ready = Boolean(process.env.PROVISIONER_DATABASE_URL && process.env.DATABASE_URL);

describe("fund environment ↔ analytics seam", { skip: !ready }, () => {
  const fundKey = `gate-proef-${Date.now().toString(36)}`;

  after(async () => {
    try {
      const db = getDb();
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "fund_${fundKey}" CASCADE`));
      await db.delete(users).where(eq(users.tenantId, fundKey));
      await db.delete(funds).where(eq(funds.key, fundKey));
      // orphan key used by the negative test
      await db.delete(funds).where(eq(funds.key, `${fundKey}-orphan`));
    } finally {
      await closeDb();
    }
  });

  it("createFundEnvironment yields empty KPIs and does not break getAgentActivity", async () => {
    const result = await createFundEnvironment({
      fundKey,
      name: "Gate proefonds",
      agentKeys: ["cao", "arbo"],
    });

    assert.equal(result.instances.length, 2);
    assert.notEqual(result.instances[0]?.publicKey, result.instances[1]?.publicKey);

    const active = await listActiveFunds();
    assert.ok(active.some((fund) => fund.key === fundKey));

    const summary = await getKpiSummary({
      fundKey,
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });
    assert.equal(summary.total, 0);
    assert.equal(await measurementStartedAt(fundKey), null);

    const corpus = await getCorpusOverview(fundKey);
    assert.equal(corpus.length, 0);

    const activity = await getAgentActivity(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    assert.ok(Array.isArray(activity));

    const publicGrant = (await getDb().execute(
      sql.raw(`
        SELECT COALESCE((
          SELECT bool_or(acl.grantee = 0)
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN LATERAL aclexplode(c.relacl) AS acl ON true
          WHERE n.nspname = 'fund_${fundKey}' AND c.relkind = 'r'
        ), false) AS public_grant
      `),
    )) as unknown as Array<{ public_grant: boolean }>;
    assert.equal(publicGrant[0]?.public_grant, false);
  });

  it("getKpiSummary counts both tenant_ids in one fund schema (multi-fonds-runtime)", async () => {
    // A multi-fund runtime writes tenant_id = its own deployment key while storing the row
    // in the answering fund's schema. Filtering KPIs on tenant_id would drop those rows (F1).
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recordedDemo = await recordInteractionEvent({
      tenantId: "demo",
      agentId: "cao",
      fund: fundKey,
      sessionId: `sess-demo-${fundKey}`,
      turnOutcome: answeredGrounded(),
      citationCount: 1,
      retrievedCount: 3,
      topScore: 0.65,
      question: "multi-runtime demo tenant",
    });
    const recordedOwn = await recordInteractionEvent({
      tenantId: fundKey,
      agentId: "cao",
      fund: fundKey,
      sessionId: `sess-own-${fundKey}`,
      turnOutcome: answeredGrounded(),
      citationCount: 1,
      retrievedCount: 2,
      topScore: 0.7,
      question: "multi-runtime fund tenant",
    });
    assert.equal(recordedDemo.recorded, true);
    assert.equal(recordedOwn.recorded, true);

    const summary = await getKpiSummary({ fundKey, since });
    assert.equal(summary.total, 2);

    const started = await measurementStartedAt(fundKey);
    assert.ok(started instanceof Date);

    const activity = await getAgentActivity(since);
    const forThisFund = activity.filter((row) => row.fundKey === fundKey);
    const activityTotal = forThisFund.reduce((sum, row) => sum + row.total, 0);
    assert.equal(activityTotal, 2);
    assert.ok(forThisFund.every((row) => row.fundKey === fundKey));

    const outcomes = await listOutcomeActivity(since);
    const outcomeRows = outcomes.filter((row) => row.fundKey === fundKey);
    assert.equal(outcomeRows.length, 1);
    assert.equal(outcomeRows[0]?.agentId, "cao");
    assert.equal(outcomeRows[0]?.byOutcome.answered, 2);
    assert.ok(outcomeRows[0]?.lastOccurredAt instanceof Date);

    // Agent-page KPIs use the same source as the fund overview: sum over agents == fund total.
    const cao = await getKpiSummary({ fundKey, agentId: "cao", since });
    const arbo = await getKpiSummary({ fundKey, agentId: "arbo", since });
    assert.equal(cao.total + arbo.total, summary.total);
  });

  it("getAgentActivity throws when control.funds has a row without a schema (why createFundEnvironment is atomic)", async () => {
    const orphanKey = `${fundKey}-orphan`;
    await getDb().insert(funds).values({
      key: orphanKey,
      name: "Orphan",
      schemaName: `fund_${orphanKey}`,
      status: "active",
    });

    await assert.rejects(
      () => getAgentActivity(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      (error: unknown) => error instanceof Error,
    );
    await assert.rejects(
      () => listOutcomeActivity(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      (error: unknown) => error instanceof Error,
    );
  });
});
