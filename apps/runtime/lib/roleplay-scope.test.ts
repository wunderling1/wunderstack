import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TenantConfig } from "@wunderstack/db";

import { resolveRoleplayFund } from "./roleplay-scope";

const ALLOW = ["opleidingsfonds", "bouwfonds"];

// Under D15 the tenant id IS the fund key (`instanceFromRow`), so the fixture only sets tenantId.
function instance(tenantId = "opleidingsfonds"): TenantConfig {
  return {
    tenantId,
    agentKey: "cao",
    publicKey: "pk_test",
    schemaName: `fund_${tenantId}`,
    connectionKey: null,
    status: "active",
    pinnedReleaseTag: null,
    corsAllowlist: [],
    theme: {},
    texts: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe("resolveRoleplayFund", () => {
  it("uses the instance fund when the client claims nothing", () => {
    assert.deepEqual(resolveRoleplayFund(instance(), undefined, ALLOW), {
      ok: true,
      fund: "opleidingsfonds",
    });
  });

  it("accepts a claim that matches the instance", () => {
    assert.deepEqual(resolveRoleplayFund(instance(), "opleidingsfonds", ALLOW), {
      ok: true,
      fund: "opleidingsfonds",
    });
  });

  it("refuses a claim for another fund even when that fund is allowlisted", () => {
    // The claim is not an authorization. A key bound to one fund must not read another's sessions.
    const result = resolveRoleplayFund(instance(), "bouwfonds", ALLOW);
    assert.equal(result.ok, false);
  });

  it("refuses an instance whose fund is not on the process allowlist", () => {
    // A control row pointing at a fund this process does not serve is a misconfiguration, not an
    // invitation to start serving it.
    const result = resolveRoleplayFund(instance("onbekendfonds"), undefined, ALLOW);
    assert.deepEqual(result, { ok: false, status: 403, error: "fund_not_allowed" });
  });

  it("checks an unkeyed claim against the allowlist", () => {
    assert.deepEqual(resolveRoleplayFund(null, "bouwfonds", ALLOW), {
      ok: true,
      fund: "bouwfonds",
    });
    assert.deepEqual(resolveRoleplayFund(null, "andersfonds", ALLOW), {
      ok: false,
      status: 403,
      error: "fund_not_allowed",
    });
  });

  it("serves an unkeyed request without demanding a configured agent instance", () => {
    // The point of this resolver: roleplay has no entry in AGENT_PROFILES, so `resolveRequestScope`
    // would fail here with `no_agent_instance` and make a roleplay-only fund unserveable.
    assert.deepEqual(resolveRoleplayFund(null, undefined, ALLOW), {
      ok: true,
      fund: "opleidingsfonds",
    });
  });
});
