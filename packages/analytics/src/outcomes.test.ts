import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerRate,
  clarificationRate,
  deriveAgentStatus,
  deriveFundStatus,
  emptyRefusedStrength,
  errorRate,
  qualityDenominator,
  rateFromParts,
  refusedJustifiedRate,
  refusedSuspiciousRate,
  refusalRate,
  strengthFromSignals,
} from "./outcomes";

test("only error turns yield no_measurable_turns for quality rates", () => {
  const counts = { answered: 0, refused: 0, clarified: 0, error: 5, unknown: 0 };
  assert.deepEqual(answerRate(counts), { kind: "no_measurable_turns" });
  assert.deepEqual(refusalRate(counts), { kind: "no_measurable_turns" });
  assert.deepEqual(clarificationRate(counts), { kind: "no_measurable_turns" });
  assert.deepEqual(errorRate(counts), { numerator: 5, denominator: 5 });
});

test("clarified increases quality denominator but not refusal numerator", () => {
  const counts = { answered: 2, refused: 1, clarified: 1, error: 0, unknown: 0 };
  assert.equal(qualityDenominator(counts), 4);
  assert.deepEqual(refusalRate(counts), { numerator: 1, denominator: 4 });
  assert.deepEqual(clarificationRate(counts), { numerator: 1, denominator: 4 });
});

test("empty outcome_reason is excluded from justified/suspicious strength split", () => {
  const strength = emptyRefusedStrength();
  assert.deepEqual(refusedJustifiedRate(strength), { kind: "no_measurable_turns" });
  assert.deepEqual(refusedSuspiciousRate(strength), { kind: "no_measurable_turns" });

  const withWeakOnly = { none: 0, weak: 2, strong: 0 };
  assert.deepEqual(refusedJustifiedRate(withWeakOnly), { numerator: 0, denominator: 2 });
  assert.deepEqual(refusedSuspiciousRate(withWeakOnly), { numerator: 0, denominator: 2 });
});

test("strengthFromSignals mirrors deriveRetrievalStrength but skips rows without reason", () => {
  assert.equal(strengthFromSignals(0, null, false), null);
  assert.equal(strengthFromSignals(0, null, true), "none");
  assert.equal(strengthFromSignals(3, 0.5, true), "weak");
  assert.equal(strengthFromSignals(3, 0.6, true), "strong");
});

test("rateFromParts returns no_measurable_turns for zero denominator", () => {
  assert.deepEqual(rateFromParts(0, 0), { kind: "no_measurable_turns" });
  assert.deepEqual(rateFromParts(2, 5), { numerator: 2, denominator: 5 });
});

// What measurementStartedAt returns is asserted against a real schema in
// fund-environment.integration.test.ts: null before the first classified row, a usable Date after.
// A regex over this file's own source proved the query was written, never that it answers.

test("deriveAgentStatus matches dashboard thresholds", () => {
  assert.equal(deriveAgentStatus(0, 0), "offline");
  assert.equal(deriveAgentStatus(10, 3), "degraded");
  assert.equal(deriveAgentStatus(10, 2), "operational");
});

test("deriveFundStatus picks the worst agent status", () => {
  assert.equal(deriveFundStatus(["operational", "degraded"]), "degraded");
  assert.equal(deriveFundStatus(["operational", "offline"]), "offline");
  assert.equal(deriveFundStatus([]), "offline");
});
