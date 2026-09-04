import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GateSpec } from "./gates";
import { createEvalHarness, formatEvalVerdict, skipReason } from "./harness";

const SPEC: GateSpec = {
  id: "G2-answer",
  layer: "G2",
  requires: "scaleway+mistral",
  title: "answer-level quality",
};

const G3_SPEC: GateSpec = {
  id: "G3-pipeline",
  layer: "G3",
  requires: "db+scaleway",
  title: "retrieval against the live corpus",
};

describe("createEvalHarness pushGate", () => {
  it("marks a gate passed when every check is green", () => {
    const harness = createEvalHarness({ requireAll: false, requireDb: false });
    const ok = harness.pushGate(SPEC, [
      { name: "hard-hallucination", ok: true },
      { name: "completeness", ok: true },
    ]);
    assert.equal(ok, true);
    assert.equal(harness.gateResults[0]?.status, "passed");
  });

  it("returns true and records advisory-failed when only an advisory check is red", () => {
    const harness = createEvalHarness({ requireAll: false, requireDb: false });
    const ok = harness.pushGate(SPEC, [
      { name: "hard-hallucination", ok: true },
      { name: "completeness", ok: false, advisory: true, detail: "0.5" },
    ]);
    assert.equal(ok, true);
    const report = harness.gateResults[0];
    assert.equal(report?.status, "advisory-failed");
    assert.equal(report?.checks[1]?.advisory, true);
    assert.equal(report?.checks[1]?.ok, false);
  });

  it("fails the gate when a blocking check is red, even if an advisory check is also red", () => {
    const harness = createEvalHarness({ requireAll: false, requireDb: false });
    const ok = harness.pushGate(SPEC, [
      { name: "hard-hallucination", ok: false },
      { name: "completeness", ok: false, advisory: true },
    ]);
    assert.equal(ok, false);
    assert.equal(harness.gateResults[0]?.status, "failed");
  });

  it("records not-applicable without failing", () => {
    const harness = createEvalHarness({ requireAll: false, requireDb: false });
    const ok = harness.pushNotApplicable(SPEC, "path scope excludes this gate");
    assert.equal(ok, true);
    assert.equal(harness.gateResults[0]?.status, "not-applicable");
    assert.equal(harness.gateResults[0]?.checks[0]?.advisory, true);
    assert.equal(harness.gateResults[0]?.checks[0]?.ok, true);
  });
});

describe("skipReason / pushUnavailable", () => {
  it("describes DB-gate skips without claiming they are required on merge to main", () => {
    const reason = skipReason("db+scaleway", "DATABASE_URL and SCALEWAY_API_KEY required");
    assert.match(reason, /nightly\/dispatch/);
    assert.match(reason, /packages\/db\|rag\|tenant/);
    assert.doesNotMatch(reason, /required on merge to main/);
  });

  it("records a skipped G3 gate with that policy detail when GATE_DB is off", () => {
    const harness = createEvalHarness({ requireAll: true, requireDb: false });
    const ok = harness.pushUnavailable(G3_SPEC, harness.requirementLabel(G3_SPEC.requires));
    assert.equal(ok, true);
    assert.equal(harness.gateResults[0]?.status, "skipped");
    const check = harness.gateResults[0]?.checks[0];
    assert.equal(check?.ok, true);
    assert.match(check?.name ?? "", /^SKIPPED:/);
    assert.match(check?.detail ?? "", /nightly\/dispatch/);
    assert.doesNotMatch(check?.detail ?? "", /required on merge to main/);
  });

  it("fails a G3 gate when requireDb is on and credentials are missing", () => {
    const harness = createEvalHarness({ requireAll: true, requireDb: true });
    const ok = harness.pushUnavailable(G3_SPEC, harness.requirementLabel(G3_SPEC.requires));
    assert.equal(ok, false);
    assert.equal(harness.gateResults[0]?.status, "failed");
    assert.match(harness.gateResults[0]?.checks[0]?.name ?? "", /^REQUIRED-BUT-UNAVAILABLE:/);
  });
});

describe("formatEvalVerdict (F0-04: skip is not PASSED)", () => {
  it("is INCOMPLETE when any gate was skipped, even if blocking checks are green", () => {
    const verdict = formatEvalVerdict(
      [{ status: "passed" }, { status: "skipped" }, { status: "skipped" }],
      { allPassed: true },
    );
    assert.equal(verdict.kind, "INCOMPLETE");
    assert.equal(verdict.run, 1);
    assert.equal(verdict.skipped, 2);
    assert.match(verdict.line, /^Eval INCOMPLETE — 1 run, 2 skipped\./);
    assert.doesNotMatch(verdict.line, /PASSED/);
  });

  it("is PASSED only when every recorded gate ran and passed (zero skips)", () => {
    const verdict = formatEvalVerdict(
      [{ status: "passed" }, { status: "advisory-failed" }],
      { allPassed: true },
    );
    assert.equal(verdict.kind, "PASSED");
    assert.equal(verdict.run, 2);
    assert.equal(verdict.skipped, 0);
    assert.match(verdict.line, /^Eval PASSED — 2 run, 0 skipped\./);
  });

  it("is INCOMPLETE on a partial EVAL_ONLY filter even with zero skips in the results", () => {
    const verdict = formatEvalVerdict([{ status: "passed" }], {
      allPassed: true,
      partialFilter: true,
    });
    assert.equal(verdict.kind, "INCOMPLETE");
    assert.doesNotMatch(verdict.line, /PASSED/);
  });

  it("is FAILED when allPassed is false, regardless of skips", () => {
    const verdict = formatEvalVerdict([{ status: "failed" }, { status: "skipped" }], {
      allPassed: false,
    });
    assert.equal(verdict.kind, "FAILED");
    assert.match(verdict.line, /^Eval FAILED/);
  });

  it("does not count not-applicable as skipped", () => {
    const verdict = formatEvalVerdict(
      [{ status: "passed" }, { status: "not-applicable" }],
      { allPassed: true },
    );
    assert.equal(verdict.kind, "PASSED");
    assert.equal(verdict.run, 1);
    assert.equal(verdict.skipped, 0);
    assert.equal(verdict.notApplicable, 1);
  });
});
