import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TenantConfig } from "@wunderstack/db";

import { resolveRequestScope } from "./instance-scope.js";

function instance(overrides: Partial<TenantConfig> & Pick<TenantConfig, "tenantId" | "agentKey">): TenantConfig {
  return {
    publicKey: "pk_test",
    schemaName: `fund_${overrides.tenantId}`,
    connectionKey: null,
    status: "active",
    pinnedReleaseTag: null,
    corsAllowlist: [],
    theme: {},
    texts: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe("resolveRequestScope (keyed)", () => {
  const allow = ["oomt", "demo"];

  it("test b: claimed fund B with key A is 403, never B", () => {
    const result = resolveRequestScope(instance({ tenantId: "oomt", agentKey: "cao" }), "demo", allow);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.error, "fund_mismatch");
    }
  });

  it("test b: omitted fund uses the instance (A), not a client default", () => {
    const result = resolveRequestScope(instance({ tenantId: "oomt", agentKey: "cao" }), undefined, allow);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fund, "oomt");
      assert.equal(result.agentKey, "cao");
    }
  });

  it("test c: two keys on the same fund resolve to different agentKey", () => {
    const cao = resolveRequestScope(instance({ tenantId: "oomt", agentKey: "cao" }), undefined, allow);
    const arbo = resolveRequestScope(instance({ tenantId: "oomt", agentKey: "arbo" }), undefined, allow);
    assert.equal(cao.ok, true);
    assert.equal(arbo.ok, true);
    if (cao.ok && arbo.ok) {
      assert.equal(cao.fund, "oomt");
      assert.equal(arbo.fund, "oomt");
      assert.equal(cao.agentKey, "cao");
      assert.equal(arbo.agentKey, "arbo");
      assert.notEqual(cao.agentKey, arbo.agentKey);
    }
  });

  it("an exercise instance key is refused here, so no event can carry it", () => {
    const result = resolveRequestScope(
      instance({ tenantId: "oomt", agentKey: "roleplay" }),
      undefined,
      allow,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.error, "unknown_agent");
    }
  });
});

describe("resolveRequestScope (unconfigured-open)", () => {
  const allow = ["oomt", "demo"];

  it("null config without unconfigured agent is 400 no_agent_instance (no CAO answer)", () => {
    const result = resolveRequestScope(null, "demo", allow, null);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.error, "no_agent_instance");
    }
  });

  it("null config with RUNTIME_UNCONFIGURED_AGENT=cao still answers as cao (local/dev)", () => {
    const result = resolveRequestScope(null, "demo", allow, "cao");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fund, "demo");
      assert.equal(result.agentKey, "cao");
    }
  });
});
