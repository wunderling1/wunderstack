import assert from "node:assert/strict";
import { after, describe, it, test } from "node:test";

import {
  closeDb,
  createFundEnvironment,
  eq,
  funds,
  getDb,
  listActiveFunds,
  roleplaySessions,
  sql,
  users,
  withFundSchema,
} from "@wunderstack/db";
import { answeredGrounded, refused } from "@wunderstack/shared";
import {
  countKnowledgeGaps,
  getAgentActivity,
  getCorpusOverview,
  getExerciseActivity,
  getKpiSummary,
  getOutcomeBreakdown,
  listConversations,
  listOutcomeActivity,
  listSignals,
  measurementStartedAt,
  SIGNAL_MIN_OCCURRENCES,
} from "./index.js";
import { recordInteractionEvent } from "./record.js";

/**
 * Requires PROVISIONER_DATABASE_URL + DATABASE_URL at process start (shared env parse).
 * GATE_DB / local: set both to the same Postgres URL.
 */
const ready = Boolean(process.env.PROVISIONER_DATABASE_URL && process.env.DATABASE_URL);

/**
 * Skipped ≠ passed (700-evals). This file holds the only tests that run the read layer against a
 * real schema, so on the paths that claim the database gate ran it must be red when it cannot run —
 * otherwise the whole suite is green while nothing was measured.
 */
test("GATE_DB=true requires a reachable database, it may not silently skip", () => {
  if (process.env.GATE_DB !== "true") return;
  assert.ok(
    ready,
    "GATE_DB=true but DATABASE_URL/PROVISIONER_DATABASE_URL are unset: the read-layer gate would skip and report green",
  );
});

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

    // A Date, not the timestamptz string the driver hands back for a raw min() — the dashboard
    // formats this value, and a string reaches Intl as NaN instead of a date (F-75).
    const started = await measurementStartedAt(fundKey);
    assert.ok(started instanceof Date);
    assert.ok(Number.isFinite(started.getTime()));
    assert.ok(started.getTime() > since.getTime() && started.getTime() <= Date.now());
    assert.doesNotThrow(() => new Intl.DateTimeFormat("nl-NL").format(started));

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

  it("exercise sessions are volume, never turns: two tables, two counts", async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await withFundSchema(fundKey, (tx) =>
      tx.insert(roleplaySessions).values([
        {
          scenarioSlug: "gate-proef",
          scenarioVersion: 1,
          scenarioSnapshot: {},
          promptVersion: "v1",
          maxTurns: 6,
        },
        {
          scenarioSlug: "gate-proef",
          scenarioVersion: 1,
          scenarioSnapshot: {},
          promptVersion: "v1",
          maxTurns: 6,
        },
      ]),
    );

    const exercise = await getExerciseActivity({ fundKey, since });
    assert.equal(exercise.sessionCount, 2);
    assert.ok(exercise.lastStartedAt instanceof Date);

    // The two sessions must not surface as answered turns anywhere in the outcome layer.
    const summary = await getKpiSummary({ fundKey, since });
    assert.equal(summary.total, 2);
    const breakdown = await getOutcomeBreakdown({ fundKey, since });
    assert.equal(breakdown.byOutcome.answered, 2);
  });

  it("a knowledge gap is a repeated question, not a refused turn (S11a)", async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const refusals = [
      "wat staat er over de reiskostenregeling",
      "wat staat er over de reiskostenregeling",
      "wat staat er over de reiskostenregeling",
      "geldt de toeslag ook op zaterdag",
      "hoe lang duurt de proeftijd",
    ];
    for (const [index, question] of refusals.entries()) {
      const recorded = await recordInteractionEvent({
        tenantId: fundKey,
        agentId: "cao",
        fund: fundKey,
        sessionId: `sess-gap-${index}-${fundKey}`,
        turnOutcome: refused("no_coverage"),
        citationCount: 0,
        retrievedCount: 0,
        topScore: null,
        question,
      });
      assert.equal(recorded.recorded, true);
    }

    // Five refused turns without retrieval, but only one question came back three times.
    const breakdown = await getOutcomeBreakdown({ fundKey, since });
    const justified = breakdown.rates.refusedJustified;
    assert.ok(!("kind" in justified));
    assert.equal(justified.numerator, 5);

    const gaps = await countKnowledgeGaps({ fundKey, since });
    assert.equal(gaps, 1);

    // And the count is the length of the list it links to — the same groups, not a parallel rule.
    const signals = await listSignals({ fundKey, since });
    assert.equal(signals.knowledgeGaps.length, gaps);
    assert.equal(signals.knowledgeGaps[0]?.occurrenceCount, 3);
    assert.equal(signals.knowledgeGaps[0]?.question, refusals[0]);
  });

  it("S18: narrowing below the threshold empties the list, it never ungroups (real query)", async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // The three copies were recorded on cao. Narrowed to arbo, the same window holds none of them:
    // the group must vanish, not fall apart into three loose rows.
    const narrowed = await listSignals({ fundKey, since, agentId: "arbo" });
    assert.deepEqual(narrowed.knowledgeGaps, []);
    assert.equal(await countKnowledgeGaps({ fundKey, since, agentId: "arbo" }), 0);

    // And a question below the threshold stays out even unnarrowed.
    const wide = await listSignals({ fundKey, since });
    assert.ok(wide.knowledgeGaps.every((row) => row.occurrenceCount >= SIGNAL_MIN_OCCURRENCES));
    assert.ok(
      wide.knowledgeGaps.every((row) => row.question !== "hoe lang duurt de proeftijd"),
      "a single refusal is not a knowledge gap",
    );
  });

  it("a filter on the list counts the same as the breakdown it came from (real query)", async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const breakdown = await getOutcomeBreakdown({ fundKey, since });

    // The filter counts questions, not conversations (S22): the KPI unit is the turn, and one
    // conversation can hold both a refused and an answered question.
    const refusedList = await listConversations({ fundKey, since, outcome: "refused" });
    assert.equal(refusedList.questionTotal, breakdown.byOutcome.refused);
    assert.ok(
      refusedList.conversationTotal <= refusedList.questionTotal,
      "conversations never outnumber the questions they hold",
    );

    const byReason = await listConversations({ fundKey, since, outcomeReason: "no_coverage" });
    assert.equal(byReason.questionTotal, breakdown.refusedByReason.no_coverage);

    // An outcome filter is a question about turns, so exercise sessions drop out of the list.
    assert.equal(byReason.exerciseTotal, 0);
    assert.ok(byReason.items.every((item) => item.kind === "grounded"));

    // Unfiltered, the sessions are back and are never rendered as question-answer pairs.
    const all = await listConversations({ fundKey, since });
    assert.equal(all.exerciseTotal, 2);
    assert.ok(all.items.some((item) => item.kind === "exercise"));
    assert.ok(
      all.items.every((item) => item.kind === "grounded" || !("outcome" in item)),
      "an exercise session carries no outcome",
    );
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
