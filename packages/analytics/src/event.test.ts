import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { answeredGrounded } from "@wunderstack/shared";

import { interactionEventInputSchema } from "./event.js";

describe("interaction event contract (Fase 1)", () => {
  it("accepts a minimal answered event and defaults citationCount", () => {
    const parsed = interactionEventInputSchema.parse({
      tenantId: "demo",
      agentId: "cao",
      fund: "demo",
      sessionId: "s-1",
      turnOutcome: answeredGrounded(),
      retrievedCount: 2,
      topScore: 0.72,
    });
    assert.equal(parsed.citationCount, 0);
    assert.equal(parsed.userId ?? null, null);
    assert.equal(parsed.traceId ?? null, null);
    assert.equal(parsed.turnOutcome.outcome, "answered");
  });

  it("rejects an unknown outcome", () => {
    const result = interactionEventInputSchema.safeParse({
      tenantId: "demo",
      agentId: "cao",
      fund: "demo",
      sessionId: "s-1",
      turnOutcome: { outcome: "maybe", outcomeReason: "grounded" },
      retrievedCount: 0,
      topScore: null,
    });
    assert.equal(result.success, false);
  });

  it("keeps a logged question and citation count", () => {
    const parsed = interactionEventInputSchema.parse({
      tenantId: "oomt",
      agentId: "cao",
      fund: "elektronische-detailhandel",
      sessionId: "s-2",
      userId: "u-9",
      traceId: "trace-abc",
      turnOutcome: answeredGrounded(),
      citationCount: 3,
      retrievedCount: 5,
      topScore: 0.81,
      question: "Hoeveel vakantiedagen heb ik?",
    });
    assert.equal(parsed.citationCount, 3);
    assert.equal(parsed.question, "Hoeveel vakantiedagen heb ik?");
    assert.equal(parsed.userId, "u-9");
  });

  it("rejects an exercise agent: a session is not an interaction event", () => {
    const rejected = interactionEventInputSchema.safeParse({
      tenantId: "oomt",
      agentId: "roleplay",
      fund: "oomt",
      sessionId: "s-4",
      turnOutcome: answeredGrounded(),
      retrievedCount: 0,
      topScore: null,
      question: "oh dat is vervelend",
    });
    assert.equal(rejected.success, false);
  });

  it("accepts an optional channel and rejects unknown values", () => {
    const parsed = interactionEventInputSchema.parse({
      tenantId: "demo",
      agentId: "cao",
      fund: "demo",
      sessionId: "s-3",
      turnOutcome: answeredGrounded(),
      retrievedCount: 1,
      topScore: 0.55,
      channel: "playground",
    });
    assert.equal(parsed.channel, "playground");

    const rejected = interactionEventInputSchema.safeParse({
      tenantId: "demo",
      agentId: "cao",
      fund: "demo",
      sessionId: "s-3",
      turnOutcome: answeredGrounded(),
      retrievedCount: 0,
      topScore: null,
      channel: "widget",
    });
    assert.equal(rejected.success, false);
  });
});
