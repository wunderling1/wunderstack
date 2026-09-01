import assert from "node:assert/strict";
import { test } from "node:test";
import {
  corpusVersionLabel,
  formatRate,
  fundStatusFromAgents,
  isOnboarding,
  totalTurns,
} from "./overview.js";

test("zero events is onboarding, not a 0% rate", () => {
  assert.equal(isOnboarding(0, 0), true);
  assert.equal(isOnboarding(4, 0), false);
  assert.equal(formatRate({ kind: "no_measurable_turns" }), "geen meetbare turns");
  assert.notEqual(formatRate({ kind: "no_measurable_turns" }), "0%");
});

test("one degraded agent makes the fund not operational", () => {
  assert.equal(
    fundStatusFromAgents([{ status: "operational" }, { status: "degraded" }]),
    "degraded",
  );
  assert.equal(fundStatusFromAgents([]), "offline");
});

test("formatRate prints numerator and denominator", () => {
  assert.equal(formatRate({ numerator: 3, denominator: 10 }), "3 / 10");
});

test("totalTurns includes unknown so pre-metric rows still count as volume", () => {
  assert.equal(
    totalTurns({ answered: 0, refused: 0, clarified: 0, error: 0, unknown: 5 }),
    5,
  );
});

test("corpusVersionLabel is n.n.b. when empty", () => {
  assert.equal(corpusVersionLabel([]), "n.n.b.");
  assert.equal(corpusVersionLabel(["cao-2026.08"]), "cao-2026.08");
});
