import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_KEYS,
  AGENT_KEY_LABELS,
  GROUNDED_AGENT_KEYS,
  agentKeySchema,
  groundedAgentKeySchema,
  isAgentKey,
  isGroundedAgentKey,
} from "./agent-keys";

describe("AGENT_KEYS", () => {
  it("lists every instanceable agent with a label", () => {
    assert.deepEqual([...AGENT_KEYS], ["cao", "arbo", "roleplay"]);
    assert.equal(AGENT_KEY_LABELS.cao, "CAO-agent");
    assert.equal(AGENT_KEY_LABELS.arbo, "Arbocatalogus-agent");
    assert.equal(AGENT_KEY_LABELS.roleplay, "Rollenspelagent");
  });

  it("isAgentKey and agentKeySchema accept only catalog keys", () => {
    assert.equal(isAgentKey("cao"), true);
    assert.equal(isAgentKey("arbo"), true);
    assert.equal(isAgentKey("roleplay"), true);
    assert.equal(isAgentKey("other"), false);
    assert.equal(agentKeySchema.safeParse("cao").success, true);
    assert.equal(agentKeySchema.safeParse("nope").success, false);
  });
});

describe("GROUNDED_AGENT_KEYS", () => {
  it("lists only the agents served by the grounded pipeline", () => {
    assert.deepEqual([...GROUNDED_AGENT_KEYS], ["cao", "arbo"]);
  });

  it("is a subset of AGENT_KEYS", () => {
    for (const key of GROUNDED_AGENT_KEYS) {
      assert.ok(isAgentKey(key), `${key} must also be an instance key`);
    }
  });

  it("rejects roleplay — it has no AgentRuntimeProfile (R1)", () => {
    assert.equal(isGroundedAgentKey("roleplay"), false);
    assert.equal(groundedAgentKeySchema.safeParse("roleplay").success, false);
  });

  it("isGroundedAgentKey and groundedAgentKeySchema accept the grounded keys", () => {
    assert.equal(isGroundedAgentKey("cao"), true);
    assert.equal(isGroundedAgentKey("arbo"), true);
    assert.equal(isGroundedAgentKey("other"), false);
    assert.equal(groundedAgentKeySchema.safeParse("arbo").success, true);
  });
});
