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

  it("maps every tenant to a fund of the same name (1-to-1)", () => {
    assert.equal(tenantFund("oomt"), "oomt");
    assert.equal(tenantFund("demo"), "demo");
  });

  it("ignores a legacy TENANT_FUND env key — override does not exist", () => {
    const env = {
      TENANT: "oomt",
      TENANT_FUND: "elektronische-detailhandel",
    } as NodeJS.ProcessEnv;
    assert.equal(defaultFund(env), "oomt");
    assert.deepEqual(resolveTenant(env), { tenant: "oomt", fund: "oomt" });
    assert.equal(tenantFund("oomt"), "oomt");
  });
});
