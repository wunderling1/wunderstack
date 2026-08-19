import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAgent, listAgents, resetAgentCache } from "./catalog.js";

describe("agent catalog", () => {
  it("lists registered agents", () => {
    const agents = listAgents();
    assert.equal(agents.length, 2);
    assert.deepEqual(agents.map((agent) => agent.id).sort(), ["arbo", "cao"]);
  });

  it("resolves a known agent", () => {
    resetAgentCache();
    const agent = getAgent("cao");
    assert.equal(typeof agent.answer, "function");
    assert.equal(typeof agent.answerStream, "function");
    const arbo = getAgent("arbo");
    assert.equal(typeof arbo.answer, "function");
  });

  it("throws for unknown agents", () => {
    assert.throws(() => getAgent("unknown"), /Unknown agent/);
  });
});
