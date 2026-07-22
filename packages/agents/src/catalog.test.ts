import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAgent, listAgents, resetAgentCache } from "./catalog.js";

describe("agent catalog", () => {
  it("lists the CAO agent", () => {
    const agents = listAgents();
    assert.equal(agents.length, 1);
    assert.equal(agents[0]?.id, "cao");
  });

  it("resolves a known agent", () => {
    resetAgentCache();
    const agent = getAgent("cao");
    assert.equal(typeof agent.answer, "function");
    assert.equal(typeof agent.answerStream, "function");
  });

  it("throws for unknown agents", () => {
    assert.throws(() => getAgent("unknown"), /Unknown agent/);
  });
});
