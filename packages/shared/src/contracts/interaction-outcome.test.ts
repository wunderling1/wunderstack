import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifySettledRunOutcome,
  classifyThrownRunOutcome,
  interactionOutcomeSchema,
  isQualityOutcome,
} from "./interaction-outcome.js";

describe("classifySettledRunOutcome", () => {
  it("tags a served answer as answered", () => {
    assert.equal(classifySettledRunOutcome({ found: true }), "answered");
  });

  it("tags empty retrieval as refused, not unverifiable", () => {
    assert.equal(classifySettledRunOutcome({ found: false }), "refused");
  });

  it("tags a clarifying question as clarified even when found is false", () => {
    assert.equal(
      classifySettledRunOutcome({ found: false, needsClarification: true }),
      "clarified",
    );
  });

  it("tags G4 coupling (unverifiable) separately from a corpus refusal", () => {
    assert.equal(
      classifySettledRunOutcome({ found: false, unverifiable: true }),
      "unverifiable",
    );
  });

  it("tags a hard-fact guard trip as unverifiable, not refused", () => {
    assert.equal(
      classifySettledRunOutcome({ found: false, hardFactGuardTriggered: true }),
      "unverifiable",
    );
  });
});

describe("classifyThrownRunOutcome", () => {
  it("maps an aborted work signal to timeout", () => {
    assert.equal(classifyThrownRunOutcome(true), "timeout");
  });

  it("maps a throw without abort to error (empty completion, provider fault)", () => {
    assert.equal(classifyThrownRunOutcome(false), "error");
  });
});

describe("isQualityOutcome", () => {
  it("excludes timeout and error from the v1 rate denominator", () => {
    assert.equal(isQualityOutcome("answered"), true);
    assert.equal(isQualityOutcome("refused"), true);
    assert.equal(isQualityOutcome("unverifiable"), true);
    assert.equal(isQualityOutcome("timeout"), false);
    assert.equal(isQualityOutcome("error"), false);
  });
});

describe("interactionOutcomeSchema", () => {
  it("accepts timeout and unverifiable", () => {
    assert.equal(interactionOutcomeSchema.parse("timeout"), "timeout");
    assert.equal(interactionOutcomeSchema.parse("unverifiable"), "unverifiable");
  });
});
