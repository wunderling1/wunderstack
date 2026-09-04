import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defaultFund, getTenantId, resolveTenant, tenantFund } from "./index";

describe("tenant context (D15)", () => {
  it("falls back to the dev default tenant when TENANT is unset", () => {
    assert.equal(getTenantId({}), "demo");
    assert.equal(defaultFund({}), "demo");
  });

  it("reads the tenant id from TENANT", () => {
    assert.equal(getTenantId({ TENANT: "oomt" }), "oomt");
  });

  it("maps an unknown tenant to a fund of the same name (1-to-1)", () => {
    assert.equal(tenantFund("oomt", { TENANT: "oomt" }), "oomt");
  });

  it("honours an explicit TENANT_FUND override", () => {
    const env = { TENANT: "oomt", TENANT_FUND: "elektronische-detailhandel" };
    assert.equal(defaultFund(env), "elektronische-detailhandel");
    assert.deepEqual(resolveTenant(env), { tenant: "oomt", fund: "elektronische-detailhandel" });
  });
});
