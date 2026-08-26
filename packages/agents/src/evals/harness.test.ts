import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GateSpec } from "./gates.js";
import { createEvalHarness } from "./harness.js";

const SPEC: GateSpec = {
  id: "G2-answer",
  layer: "G2",
  requires: "scaleway+mistral",
  title: "answer-level quality",
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
