import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fundRecordsFromReport, unrecorded, FUND_LEDGER_SCHEMA_VERSION } from "./fund-ledger.js";
import type { EvalReport, FundLayerReport, GateReport, GateStatus } from "./report-writer.js";

function fundLayer(key: string, fund: string, corpusVersion: string): FundLayerReport {
  return {
    key,
    fund,
    corpusVersion,
    fixtureHash: "hash",
    answerableQueries: 14,
    metrics: { hitAt1: 1, recallAt3: 1, recallAt5: 1, mrr: 1 },
    thresholds: { hitAt1: 0.7, recallAt3: 0.8, recallAt5: 0.8, mrr: 0.75 },
    refusalGuard: { probes: 1, empty: 1, required: 1 },
  };
}

function fundGate(key: string, corpusVersion: string, status: GateStatus, failed: string[] = []): GateReport {
  return {
    id: `G3-fund [${key} (corpus v${corpusVersion})]`,
    layer: "G3",
    title: "fund-specific correctness (nightly)",
    status,
    checks: [
      { name: `fund "${key}" retrieval: hit@1 >= 70.0%`, ok: true },
      ...failed.map((name) => ({ name, ok: false })),
    ],
  };
}

function report(overrides: Partial<EvalReport> = {}): EvalReport {
  return {
    schemaVersion: 6,
    generatedAt: "2026-07-30T20:32:11.776Z",
    commitSha: "28b1911",
    corpusVersion: "4",
    passed: false,
    config: { requireAll: true, judgeSamples: 3, writeBaseline: false },
    models: { generator: "g", judge: "j", embedding: "e", rerank: "r" },
    gates: [],
    retrieval: null,
    retrievalIntegration: null,
    answer: null,
    funds: [],
    judge: { parseRetryCount: 0 },
    ...overrides,
  };
}

describe("fundRecordsFromReport", () => {
  it("carries the run identity onto every fund record", () => {
    const records = fundRecordsFromReport(
      report({
        funds: [fundLayer("etd-full", "elektronische-detailhandel", "etd-full-1")],
        gates: [fundGate("etd-full", "etd-full-1", "passed")],
      }),
    );

    assert.equal(records.length, 1);
    assert.deepEqual(
      { ...records[0], runArtefact: "(path)" },
      {
        schemaVersion: FUND_LEDGER_SCHEMA_VERSION,
        kind: "g3-fund",
        setKey: "etd-full",
        fund: "elektronische-detailhandel",
        corpusVersion: "etd-full-1",
        status: "passed",
        failedChecks: [],
        commitSha: "28b1911",
        generatedAt: "2026-07-30T20:32:11.776Z",
        runArtefact: "(path)",
      },
    );
  });

  it("records the failed check names so a NO-GO can be explained without the artefact", () => {
    const records = fundRecordsFromReport(
      report({
        funds: [fundLayer("demo", "demo", "demo-1")],
        gates: [fundGate("demo", "demo-1", "failed", ['fund "demo" refusal-guard: >= 1 out-of-corpus probes return 0 hits'])],
      }),
    );

    assert.equal(records[0]?.status, "failed");
    assert.deepEqual(records[0]?.failedChecks, [
      'fund "demo" refusal-guard: >= 1 out-of-corpus probes return 0 hits',
    ]);
  });

  it("does not let a key match a longer key that starts with it", () => {
    // "etd" must not pick up the "etd-full" gate: that would report one fund's verdict as another's.
    const records = fundRecordsFromReport(
      report({
        funds: [fundLayer("etd", "eval-fixtures", "etd-1"), fundLayer("etd-full", "elektronische-detailhandel", "etd-full-1")],
        gates: [
          fundGate("etd-full", "etd-full-1", "failed", ["guard"]),
          fundGate("etd", "etd-1", "passed"),
        ],
      }),
    );

    assert.equal(records.find((record) => record.setKey === "etd")?.status, "passed");
    assert.equal(records.find((record) => record.setKey === "etd-full")?.status, "failed");
  });

  it("never reports a fund as passed when its gate is missing from the artefact", () => {
    const records = fundRecordsFromReport(
      report({ funds: [fundLayer("demo", "demo", "demo-1")], gates: [] }),
    );

    assert.equal(records[0]?.status, "skipped");
    assert.deepEqual(records[0]?.failedChecks, ["gate result missing from run artefact"]);
  });

  it("yields nothing when no fund set ran", () => {
    assert.deepEqual(fundRecordsFromReport(report()), []);
  });
});

describe("unrecorded", () => {
  const base = fundRecordsFromReport(
    report({
      funds: [fundLayer("etd-full", "elektronische-detailhandel", "etd-full-1")],
      gates: [fundGate("etd-full", "etd-full-1", "passed")],
    }),
  );

  it("drops an outcome the ledger already holds", () => {
    // The eval appends its own records and CI replays the uploaded artefact through the same path,
    // so the same run legitimately arrives twice and must not double-count.
    assert.deepEqual(unrecorded(base, base), []);
  });

  it("keeps a later run of the same fund", () => {
    const later = base.map((record) => ({ ...record, generatedAt: "2026-07-31T20:00:00.000Z" }));
    assert.equal(unrecorded(base, later).length, 1);
  });

  it("keeps the same run measured on another commit", () => {
    const other = base.map((record) => ({ ...record, commitSha: "deadbeef" }));
    assert.equal(unrecorded(base, other).length, 1);
  });

  it("appends everything into an empty ledger", () => {
    assert.equal(unrecorded([], base).length, 1);
  });
});
