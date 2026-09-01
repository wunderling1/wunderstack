import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  answeredGrounded,
  clarifiedOutcome,
  errored,
  isQualityOutcome,
  refused,
  turnOutcomeSchema,
  writableTurnOutcomeSchema,
} from "./interaction-outcome.js";

describe("TurnOutcome helpers", () => {
  it("builds answered/grounded", () => {
    assert.deepEqual(answeredGrounded(), { outcome: "answered", outcomeReason: "grounded" });
  });

  it("builds refused with each reason", () => {
    assert.deepEqual(refused("no_coverage"), {
      outcome: "refused",
      outcomeReason: "no_coverage",
    });
    assert.deepEqual(refused("guard_hard_fact"), {
      outcome: "refused",
      outcomeReason: "guard_hard_fact",
    });
    assert.deepEqual(refused("guard_citation_coupling"), {
      outcome: "refused",
      outcomeReason: "guard_citation_coupling",
    });
  });

  it("builds clarified/ambiguous_query", () => {
    assert.deepEqual(clarifiedOutcome(), {
      outcome: "clarified",
      outcomeReason: "ambiguous_query",
    });
  });

  it("builds error outcomes", () => {
    assert.deepEqual(errored("timeout"), { outcome: "error", outcomeReason: "timeout" });
    assert.deepEqual(errored("provider_error"), {
      outcome: "error",
      outcomeReason: "provider_error",
    });
  });
});

describe("turnOutcomeSchema", () => {
  it("accepts unknown with null reason (migration rows only)", () => {
    assert.deepEqual(turnOutcomeSchema.parse({ outcome: "unknown", outcomeReason: null }), {
      outcome: "unknown",
      outcomeReason: null,
    });
  });

  it("rejects unknown on the writable schema", () => {
    const result = writableTurnOutcomeSchema.safeParse({ outcome: "unknown", outcomeReason: null });
    assert.equal(result.success, false);
  });
});

describe("isQualityOutcome", () => {
  it("excludes error and unknown from the rate denominator", () => {
    assert.equal(isQualityOutcome("answered"), true);
    assert.equal(isQualityOutcome("refused"), true);
    assert.equal(isQualityOutcome("clarified"), true);
    assert.equal(isQualityOutcome("error"), false);
    assert.equal(isQualityOutcome("unknown"), false);
  });
});
