import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { instanceFund, resolveFundScope } from "./fund-scope";

describe("instanceFund", () => {
  it("uses the tenant fallback when the allowlist is empty", () => {
    assert.equal(instanceFund([], "demo"), "demo");
  });

  it("prefers the tenant fallback when it is on the allowlist", () => {
    assert.equal(instanceFund(["oomt", "demo"], "demo"), "demo");
  });

  it("uses the first allowlisted fund when the tenant fallback is not on it", () => {
    assert.equal(instanceFund(["elektronische-detailhandel", "oomt"], "demo"), "elektronische-detailhandel");
  });
});

describe("resolveFundScope", () => {
  it("defaults an omitted fund to the instance fund instead of refusing", () => {
    const result = resolveFundScope(undefined, ["elektronische-detailhandel", "oomt"]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fund, "elektronische-detailhandel");
    }
  });

  it("honours an explicit allowlisted fund", () => {
    const result = resolveFundScope("oomt", ["elektronische-detailhandel", "oomt"]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fund, "oomt");
    }
  });

  it("refuses a fund that is not on the allowlist", () => {
    const result = resolveFundScope("other", ["elektronische-detailhandel", "oomt"]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.error, "fund_not_allowed");
    }
  });
});
