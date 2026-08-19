import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interactionEventInputSchema } from "./event.js";

describe("interaction event contract (Fase 1)", () => {
  it("accepts a minimal answered event and defaults citationCount", () => {
    const parsed = interactionEventInputSchema.parse({
      tenantId: "demo",
      agentId: "cao",
      fund: "demo",
      sessionId: "s-1",
      outcome: "answered",
    });
    assert.equal(parsed.citationCount, 0);
    assert.equal(parsed.userId ?? null, null);
    assert.equal(parsed.traceId ?? null, null);
  });

  it("rejects an unknown outcome", () => {
    const result = interactionEventInputSchema.safeParse({
      tenantId: "demo",
      agentId: "cao",
      fund: "demo",
      sessionId: "s-1",
      outcome: "maybe",
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
      outcome: "answered",
      citationCount: 3,
      question: "Hoeveel vakantiedagen heb ik?",
    });
    assert.equal(parsed.citationCount, 3);
    assert.equal(parsed.question, "Hoeveel vakantiedagen heb ik?");
    assert.equal(parsed.userId, "u-9");
  });

  it("accepts an optional channel and rejects unknown values", () => {
    const parsed = interactionEventInputSchema.parse({
      tenantId: "demo",
      agentId: "cao",
      fund: "demo",
      sessionId: "s-3",
      outcome: "answered",
      channel: "playground",
    });
    assert.equal(parsed.channel, "playground");

    const rejected = interactionEventInputSchema.safeParse({
      tenantId: "demo",
      agentId: "cao",
      fund: "demo",
      sessionId: "s-3",
      outcome: "answered",
      channel: "widget",
    });
    assert.equal(rejected.success, false);
  });
});
