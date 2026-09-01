import assert from "node:assert/strict";
import { test } from "node:test";
import {
  breakdownCountForFilter,
  includeExerciseSessions,
  includeGroundedTurns,
  mapExerciseRow,
  mapGroundedRow,
} from "./conversations.js";
import type { OutcomeBreakdown } from "./outcomes.js";

const emptyBreakdown: OutcomeBreakdown = {
  byOutcome: { answered: 4, refused: 10, clarified: 1, error: 0, unknown: 2 },
  refusedByReason: { no_coverage: 7, guard_hard_fact: 1, guard_citation_coupling: 0, out_of_scope: 2 },
  refusedByStrength: { none: 5, weak: 3, strong: 2 },
  rates: {
    answered: { numerator: 4, denominator: 15 },
    refused: { numerator: 10, denominator: 15 },
    clarified: { numerator: 1, denominator: 15 },
    error: { kind: "no_measurable_turns" },
    refusedJustified: { numerator: 5, denominator: 10 },
    refusedSuspicious: { numerator: 2, denominator: 10 },
  },
};

test("reason filter count matches getOutcomeBreakdown.refusedByReason", () => {
  assert.equal(breakdownCountForFilter(emptyBreakdown, { outcomeReason: "no_coverage" }), 7);
  assert.equal(
    breakdownCountForFilter(emptyBreakdown, { outcome: "refused", outcomeReason: "out_of_scope" }),
    2,
  );
  assert.equal(breakdownCountForFilter(emptyBreakdown, { outcome: "refused" }), 10);
  assert.equal(breakdownCountForFilter(emptyBreakdown, {}), null);
});

test("exercise sessions drop out of outcome/reason filters", () => {
  assert.equal(includeExerciseSessions({ fundKey: "demo", since: new Date() }), true);
  assert.equal(
    includeExerciseSessions({ fundKey: "demo", since: new Date(), outcome: "refused" }),
    false,
  );
  assert.equal(
    includeExerciseSessions({ fundKey: "demo", since: new Date(), outcomeReason: "no_coverage" }),
    false,
  );
  assert.equal(
    includeExerciseSessions({ fundKey: "demo", since: new Date(), agentId: "cao" }),
    false,
  );
  assert.equal(
    includeExerciseSessions({ fundKey: "demo", since: new Date(), agentId: "roleplay" }),
    true,
  );
});

test("grounded turns follow the grounded profile, not a key switch in the card", () => {
  assert.equal(includeGroundedTurns({ fundKey: "demo", since: new Date(), agentId: "cao" }), true);
  assert.equal(includeGroundedTurns({ fundKey: "demo", since: new Date(), agentId: "arbo" }), true);
  assert.equal(
    includeGroundedTurns({ fundKey: "demo", since: new Date(), agentId: "roleplay" }),
    false,
  );
});

test("exercise row is not a question-answer pair", () => {
  const item = mapExerciseRow({
    id: "11111111-1111-1111-1111-111111111111",
    startedAt: new Date("2026-09-01T10:00:00.000Z"),
    endedAt: new Date("2026-09-01T10:05:00.000Z"),
    scenarioSlug: "gesprek-leidinggevende",
    turnsUsed: 4,
    maxTurns: 8,
    status: "ended",
    endReason: "abandoned",
  });
  assert.equal(item.kind, "exercise");
  assert.equal("question" in item, false);
  assert.equal("outcome" in item, false);
  assert.equal("citationCount" in item, false);
  assert.equal(item.scenarioSlug, "gesprek-leidinggevende");
  assert.equal(item.turnsUsed, 4);
  assert.equal(item.endReason, "abandoned");
});

test("grounded row keeps the turn fields the card needs", () => {
  const item = mapGroundedRow({
    id: "22222222-2222-2222-2222-222222222222",
    agentId: "cao",
    occurredAt: new Date("2026-09-01T10:00:00.000Z"),
    question: "Hoeveel vakantiedagen?",
    outcome: "answered",
    outcomeReason: "grounded",
    citationCount: 2,
  });
  assert.equal(item.kind, "grounded");
  assert.equal(item.question, "Hoeveel vakantiedagen?");
  assert.equal(item.outcome, "answered");
});

// That a reason filter on listConversations counts the same as getOutcomeBreakdown.refusedByReason
// is asserted against a real schema in fund-environment.integration.test.ts. Matching both WHERE
// clauses as text showed they were written alike, not that they answer alike.
