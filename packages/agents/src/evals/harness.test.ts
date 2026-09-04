import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GateSpec } from "./gates";
import { createEvalHarness, skipReason } from "./harness";

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
