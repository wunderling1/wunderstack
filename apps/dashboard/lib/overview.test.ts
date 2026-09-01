import assert from "node:assert/strict";
import { test } from "node:test";
import {
  corpusVersionLabel,
  formatRate,
  fundStatusFromAgents,
  isOnboarding,
  totalQuestions,
} from "./overview.js";

test("zero events is onboarding, not a 0% rate", () => {
  assert.equal(isOnboarding(0, 0), true);
  assert.equal(isOnboarding(4, 0), false);
  assert.equal(formatRate({ kind: "no_measurable_turns" }), "geen meetbare vragen");
  assert.notEqual(formatRate({ kind: "no_measurable_turns" }), "0%");
});

test("one degraded agent makes the fund not operational", () => {
  assert.equal(
    fundStatusFromAgents([{ status: "operational" }, { status: "degraded" }]),
    "degraded",
  );
  assert.equal(fundStatusFromAgents([]), "offline");
});

test("formatRate reads as a count of questions, the KPI unit (S22)", () => {
  assert.equal(formatRate({ numerator: 3, denominator: 10 }), "3 van 10");
  assert.equal(formatRate({ numerator: 1061, denominator: 1271 }), "1.061 van 1.271");
});

test("totalQuestions includes unknown so pre-metric rows still count as volume", () => {
  assert.equal(
    totalQuestions({ answered: 0, refused: 0, clarified: 0, error: 0, unknown: 5 }),
    5,
  );
});

test("corpusVersionLabel is n.n.b. when empty", () => {
  assert.equal(corpusVersionLabel([]), "n.n.b.");
  assert.equal(corpusVersionLabel(["cao-2026.08"]), "cao-2026.08");
});
