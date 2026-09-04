import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fundSchemaName } from "@wunderstack/db";
import { getTenantId, tenantFund } from "@wunderstack/tenant";

import { searchPathForRetrieve } from "./retrieve";

/**
 * F1-01 identity probe: tenant id, fund domain word, physical schema, and retrieval search_path
 * must agree. There is one assembler (`fundSchemaName`); `TENANT_FUND` no longer exists.
 */
describe("fund identity (tenant + schema + retrieval)", () => {
  it("keeps getTenantId, tenantFund, fundSchemaName, and searchPathForRetrieve on one string", () => {
    const env = { TENANT: "oomt" };
    const tenant = getTenantId(env);
    const fund = tenantFund(tenant, env);
    const schema = fundSchemaName(fund);
    const searchPath = searchPathForRetrieve({ fund });

    assert.equal(tenant, "oomt");
    assert.equal(fund, tenant);
    assert.equal(schema, "fund_oomt");
    assert.equal(searchPath, schema);
    assert.equal(searchPath, fundSchemaName(getTenantId(env)));
  });

  it("fails the identity chain if fundSchemaName used a different prefix (probe)", () => {
    // Temporary wrong formula must not equal searchPathForRetrieve — guards against a second assembler.
    const wrong = (id: string) => `schema_${id}`;
    assert.notEqual(wrong("oomt"), searchPathForRetrieve({ fund: "oomt" }));
    assert.equal(fundSchemaName("oomt"), searchPathForRetrieve({ fund: "oomt" }));
  });
});
