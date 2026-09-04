import assert from "node:assert/strict";
import { test } from "node:test";
import { groupIntoConversations } from "./conversation-boundary";
import {
  breakdownCountForFilter,
  includeExerciseSessions,
  includeGroundedTurns,
  mapExerciseRow,
  mapQuestionRow,
  matchesOutcomeFilter,
  toGroundedConversation,
} from "./conversations";
import type { OutcomeBreakdown } from "./outcomes";

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

test("a question carries the outcome, and carries it unmatched unless a filter says so", () => {
  const row = {
    id: "22222222-2222-2222-2222-222222222222",
    occurredAt: new Date("2026-09-01T10:00:00.000Z"),
    question: "Hoeveel vakantiedagen?",
    outcome: "answered",
    outcomeReason: "grounded",
    citationCount: 2,
    channel: "playground",
  };
  const question = mapQuestionRow(row);
  assert.equal(question.question, "Hoeveel vakantiedagen?");
  assert.equal(question.outcome, "answered");
  assert.equal(question.matchesFilter, false);
  assert.equal(mapQuestionRow(row, true).matchesFilter, true);
});

/** Narrows the indexed access the grouper cannot promise to the type system. */
function onlyGroup<T>(groups: T[]): T {
  assert.equal(groups.length, 1, "expected exactly one conversation");
  const [group] = groups;
  assert.ok(group);
  return group;
}

function turn(
  id: string,
  minutesFromNoon: number,
  overrides: {
    sessionId?: string;
    agentId?: string;
    outcome?: string;
    channel?: string | null;
  } = {},
) {
  return {
    id,
    sessionId: overrides.sessionId ?? "tab-1",
    agentId: overrides.agentId ?? "cao",
    occurredAt: new Date(Date.UTC(2026, 8, 1, 12, minutesFromNoon)),
    question: `vraag ${id}`,
    outcome: overrides.outcome ?? "answered",
    outcomeReason: null,
    citationCount: 0,
    channel: overrides.channel === undefined ? "playground" : overrides.channel,
  };
}

test("a conversation has a course, not an outcome: the chip sits on each question (S22)", () => {
  const group = onlyGroup(
    groupIntoConversations([turn("a", 0), turn("b", 5, { outcome: "refused" }), turn("c", 9)]),
  );

  const conversation = toGroundedConversation(group, { outcome: "refused" });
  assert.equal(conversation.kind, "grounded");
  assert.equal("outcome" in conversation, false, "the container carries no outcome");
  assert.equal(conversation.questions.length, 3);
  assert.deepEqual(
    conversation.questions.map((question) => question.matchesFilter),
    [false, true, false],
    "only the refused question is what the filter selected",
  );
  assert.equal(conversation.startedAt.getTime(), conversation.questions[0]?.occurredAt.getTime());
  assert.equal(conversation.occurredAt.getTime(), conversation.questions[2]?.occurredAt.getTime());
});

test("without a filter no question is marked as matched, so nothing is highlighted", () => {
  const group = onlyGroup(groupIntoConversations([turn("a", 0), turn("b", 3)]));
  const conversation = toGroundedConversation(group, {});
  assert.ok(conversation.questions.every((question) => !question.matchesFilter));
  assert.ok(conversation.questions.every((question) => matchesOutcomeFilter(question, {})));
});

test("a channel without a thread id is named as such instead of counted as adoption (A6)", () => {
  const mcp = onlyGroup(
    groupIntoConversations([turn("a", 0, { channel: "mcp", sessionId: "one-shot" })]),
  );
  assert.equal(toGroundedConversation(mcp).threaded, false);

  // A pre-channel row is playground/embed traffic and does group: one measured session holds 21.
  const historic = onlyGroup(groupIntoConversations([turn("b", 0, { channel: null })]));
  assert.equal(toGroundedConversation(historic).threaded, true);
});

// That a reason filter on listConversations counts the same as getOutcomeBreakdown.refusedByReason
// is asserted against a real schema in fund-environment.integration.test.ts. Matching both WHERE
// clauses as text showed they were written alike, not that they answer alike.
