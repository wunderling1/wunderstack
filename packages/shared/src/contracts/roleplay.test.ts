import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  roleplayCriterionScoreSchema,
  roleplayEventSchema,
  roleplayReviewPayloadSchema,
  roleplayReviewRequestSchema,
  roleplayStartRequestSchema,
  roleplayTurnRequestSchema,
} from "./roleplay.js";

const SESSION_ID = "3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8";

describe("roleplayCriterionScoreSchema", () => {
  it("accepts a null score — 'not judged' must not be storable as a zero", () => {
    const parsed = roleplayCriterionScoreSchema.parse({
      question: "Vraagt de deelnemer door?",
      feedback: "",
      score: null,
      weight: 60,
    });
    assert.equal(parsed.score, null);
  });

  it("treats weight as a percentage, not the 1-5 author rating", () => {
    assert.ok(roleplayCriterionScoreSchema.safeParse({
      question: "q",
      feedback: "",
      score: 7,
      weight: 100,
    }).success);
    assert.ok(!roleplayCriterionScoreSchema.safeParse({
      question: "q",
      feedback: "",
      score: 7,
      weight: 101,
    }).success);
  });

  it("rejects a score outside the 0-10 scale at the API boundary", () => {
    // The reviewer clamps; anything still out of range here is a bug, not a model quirk.
    assert.ok(!roleplayCriterionScoreSchema.safeParse({
      question: "q",
      feedback: "",
      score: 11,
      weight: 50,
    }).success);
  });
});

describe("request schemas", () => {
  it("rejects unknown fields rather than silently ignoring them", () => {
    assert.ok(!roleplayStartRequestSchema.safeParse({ scenarioSlug: "a", agent: "cao" }).success);
    assert.ok(!roleplayTurnRequestSchema.safeParse({ sessionId: SESSION_ID, message: "hoi", maxTurns: 99 }).success);
  });

  it("rejects an unknown difficulty instead of falling back to the baseline", () => {
    assert.ok(!roleplayStartRequestSchema.safeParse({ scenarioSlug: "a", difficulty: "nightmare" }).success);
    assert.ok(roleplayStartRequestSchema.safeParse({ scenarioSlug: "a", difficulty: "expert" }).success);
  });

  it("requires a real session uuid on a turn", () => {
    assert.ok(!roleplayTurnRequestSchema.safeParse({ sessionId: "session-1", message: "hoi" }).success);
    assert.ok(roleplayTurnRequestSchema.safeParse({ sessionId: SESSION_ID, message: "hoi" }).success);
  });

  it("rejects an empty message with a Dutch reason the client can show", () => {
    const result = roleplayTurnRequestSchema.safeParse({ sessionId: SESSION_ID, message: "" });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0]?.message, "Typ een bericht.");
  });

  it("lets the review request omit an end reason", () => {
    assert.ok(roleplayReviewRequestSchema.safeParse({ sessionId: SESSION_ID }).success);
    assert.ok(roleplayReviewRequestSchema.safeParse({ sessionId: SESSION_ID, endReason: "abandoned" }).success);
  });

  it("defaults origin to embed and refuses a delivery target on that path", () => {
    assert.ok(roleplayStartRequestSchema.safeParse({ scenarioSlug: "a" }).success);
    assert.ok(
      !roleplayStartRequestSchema.safeParse({
        scenarioSlug: "a",
        resultTarget: { kind: "webhook", url: "https://fonds.example/hook" },
      }).success,
    );
  });

  it("requires a resultTarget on a webhook launch and refuses a client-claimed LTI origin", () => {
    assert.ok(
      !roleplayStartRequestSchema.safeParse({ scenarioSlug: "a", origin: "webhook" }).success,
    );
    assert.ok(
      roleplayStartRequestSchema.safeParse({
        scenarioSlug: "a",
        origin: "webhook",
        resultTarget: { kind: "webhook", url: "https://fonds.example/hook" },
      }).success,
    );
    assert.ok(!roleplayStartRequestSchema.safeParse({ scenarioSlug: "a", origin: "lti11" }).success);
    assert.ok(!roleplayStartRequestSchema.safeParse({ scenarioSlug: "a", origin: "lti13" }).success);
  });

  it("rejects an email in the platform refs (R3)", () => {
    assert.ok(
      !roleplayStartRequestSchema.safeParse({
        scenarioSlug: "a",
        origin: "webhook",
        resultTarget: { kind: "webhook", url: "https://fonds.example/hook" },
        externalUserRef: "naam@fonds.nl",
      }).success,
    );
  });
});

describe("roleplayEventSchema", () => {
  it("carries no citation fields — those are the grounded product's promise, not this one's", () => {
    const turn = {
      type: "turn" as const,
      reply: "Dat duurt te lang.",
      conversationEnd: false,
      turnsUsed: 3,
      maxTurns: 12,
      endReason: null,
    };
    const parsed = roleplayEventSchema.parse(turn);
    assert.equal("citations" in parsed, false);
    assert.equal("found" in parsed, false);
  });

  it("requires an end reason to be stated as null while the conversation continues", () => {
    assert.ok(!roleplayEventSchema.safeParse({
      type: "turn",
      reply: "…",
      conversationEnd: false,
      turnsUsed: 1,
      maxTurns: 12,
    }).success);
  });

  it("round-trips every event type through JSON", () => {
    const events = [
      { type: "status" as const, phase: "generating" as const },
      { type: "text" as const, delta: "Hallo" },
      {
        type: "turn" as const,
        reply: "Tot ziens.",
        conversationEnd: true,
        turnsUsed: 12,
        maxTurns: 12,
        endReason: "max_turns_reached" as const,
      },
      {
        type: "done" as const,
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        traceId: null,
      },
      { type: "error" as const, message: "Er ging iets mis." },
    ];
    for (const event of events) {
      assert.deepEqual(roleplayEventSchema.parse(JSON.parse(JSON.stringify(event))), event);
    }
  });

  it("rejects a turn budget of zero — a session must always allow at least one turn", () => {
    assert.ok(!roleplayEventSchema.safeParse({
      type: "turn",
      reply: "…",
      conversationEnd: true,
      turnsUsed: 0,
      maxTurns: 0,
      endReason: "completed",
    }).success);
  });
});

describe("roleplayReviewPayloadSchema", () => {
  it("echoes the threshold so the client need not refetch the scenario to explain the verdict", () => {
    const payload = roleplayReviewPayloadSchema.parse({
      criteria: [{ question: "q", feedback: "f", score: 8, weight: 100 }],
      weightedScore: 8,
      passed: true,
      passThreshold: 5.5,
      feedbackSummary: "Goed gesprek.",
    });
    assert.equal(payload.passThreshold, 5.5);
  });
});
