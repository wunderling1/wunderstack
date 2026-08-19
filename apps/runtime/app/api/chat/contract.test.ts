import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chatRequestSchema } from "./contract.js";

describe("chatRequestSchema", () => {
  it("rejects a client-supplied agentId (server resolves the agent)", () => {
    const parsed = chatRequestSchema.safeParse({
      question: "Wat is mijn vakantie?",
      agentId: "arbo",
    });
    assert.equal(parsed.success, false);
  });

  it("accepts a minimal valid request", () => {
    const parsed = chatRequestSchema.safeParse({ question: "Wat is mijn vakantie?" });
    assert.equal(parsed.success, true);
  });
});
