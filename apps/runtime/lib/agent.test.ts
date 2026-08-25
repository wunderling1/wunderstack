import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAgent } from "@wunderstack/agents";

import { getAgentById, resolveAgentIdFromConfig } from "./agent.js";

describe("resolveAgentIdFromConfig", () => {
  it("returns null when config is missing and unconfigured agent is unset", () => {
    assert.equal(resolveAgentIdFromConfig(null, undefined), null);
    assert.equal(resolveAgentIdFromConfig(undefined, undefined), null);
    assert.equal(resolveAgentIdFromConfig(null, ""), null);
  });

  it("returns the explicit unconfigured agent when config is missing", () => {
    assert.equal(resolveAgentIdFromConfig(null, "cao"), "cao");
    assert.equal(resolveAgentIdFromConfig(undefined, "arbo"), "arbo");
  });

  it("reads agentKey from tenant config (ignores unconfigured env)", () => {
    assert.equal(resolveAgentIdFromConfig({ agentKey: "cao" }, "arbo"), "cao");
    assert.equal(resolveAgentIdFromConfig({ agentKey: "arbo" }, undefined), "arbo");
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
