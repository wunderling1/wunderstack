import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AGENT_KEYS, agentKeySchema, isAgentKey, AGENT_KEY_LABELS } from "./agent-keys.js";

describe("AGENT_KEYS", () => {
  it("lists cao and arbo with labels", () => {
    assert.deepEqual([...AGENT_KEYS], ["cao", "arbo"]);
    assert.equal(AGENT_KEY_LABELS.cao, "CAO-agent");
    assert.equal(AGENT_KEY_LABELS.arbo, "Arbocatalogus-agent");
  });

  it("isAgentKey and agentKeySchema accept only catalog keys", () => {
    assert.equal(isAgentKey("cao"), true);
    assert.equal(isAgentKey("arbo"), true);
    assert.equal(isAgentKey("other"), false);
    assert.equal(agentKeySchema.safeParse("cao").success, true);
    assert.equal(agentKeySchema.safeParse("nope").success, false);
  });
});
