import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAgent } from "@wunderstack/agents";

import { getAgentById, resolveAgentIdFromConfig } from "./agent.js";

describe("resolveAgentIdFromConfig", () => {
  it("defaults to cao when config is missing", () => {
    assert.equal(resolveAgentIdFromConfig(null), "cao");
    assert.equal(resolveAgentIdFromConfig(undefined), "cao");
  });

  it("reads agentKey from tenant config", () => {
    assert.equal(resolveAgentIdFromConfig({ agentKey: "cao" }), "cao");
    assert.equal(resolveAgentIdFromConfig({ agentKey: "arbo" }), "arbo");
  });
});

describe("getAgentById", () => {
  it("returns the cao agent for a known id", () => {
    const agent = getAgentById("cao");
    assert.equal(agent, getAgent("cao"));
  });

  it("throws for an unknown id", () => {
    assert.throws(() => getAgentById("unknown-agent"), /Unknown agent/);
  });
});
