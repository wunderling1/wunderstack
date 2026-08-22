import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bindClaimsToInstance,
  instanceFromRow,
  langfuseTagsFromInstance,
  retrievalScope,
  type ResolvedInstance,
} from "./resolve-instance.js";

function oomtCao(): ResolvedInstance {
  return instanceFromRow({
    tenantId: "oomt",
    agentKey: "cao",
    schemaName: "fund_oomt",
    connectionKey: null,
  });
}

function oomtArbo(): ResolvedInstance {
  return instanceFromRow({
    tenantId: "oomt",
    agentKey: "arbo",
    schemaName: "fund_oomt",
    connectionKey: null,
  });
}

describe("bindClaimsToInstance (test b: key A + param B → A or 4xx, never B)", () => {
  it("uses the instance fund when the client omits fund", () => {
    const result = bindClaimsToInstance(oomtCao(), {});
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.instance.fundKey, "oomt");
      assert.equal(retrievalScope(result.instance).fund, "oomt");
    }
  });

  it("accepts a claimed fund that matches the key", () => {
    const result = bindClaimsToInstance(oomtCao(), { fund: "oomt" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(retrievalScope(result.instance).fund, "oomt");
    }
  });

  it("rejects a claimed fund that disagrees with the key and does not return B", () => {
    const result = bindClaimsToInstance(oomtCao(), { fund: "demo" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.error, "fund_mismatch");
    }
    // The instance is unchanged — callers must not fall back to the claimed fund.
    assert.equal(retrievalScope(oomtCao()).fund, "oomt");
    assert.notEqual(retrievalScope(oomtCao()).fund, "demo");
  });

  it("rejects a claimed agentKey that disagrees with the key", () => {
    const result = bindClaimsToInstance(oomtCao(), { agentKey: "arbo" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "agent_mismatch");
    }
    assert.equal(retrievalScope(oomtCao()).agentKey, "cao");
  });
});

describe("retrievalScope (test c: two keys same fund → different agent_key)", () => {
  it("sends distinct agent keys to retrieve for cao vs arbo on the same fund", () => {
    const cao = retrievalScope(oomtCao());
    const arbo = retrievalScope(oomtArbo());
    assert.equal(cao.fund, "oomt");
    assert.equal(arbo.fund, "oomt");
    assert.equal(cao.agentKey, "cao");
    assert.equal(arbo.agentKey, "arbo");
    assert.notEqual(cao.agentKey, arbo.agentKey);
  });
});

describe("langfuseTagsFromInstance", () => {
  it("emits fund, agent_key, corpus_version, environment from the resolved instance", () => {
    assert.deepEqual(
      langfuseTagsFromInstance(oomtCao(), { corpusVersion: "arbo-oomt-1", environment: "production" }),
      ["oomt", "cao", "arbo-oomt-1", "production"],
    );
  });
});

// Track B: test (a) "query without SET ROLE → permission denied" does not apply.
// Isolation is D15 (embed-auth tenantId check). Do not report that test green.
