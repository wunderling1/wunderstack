import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { unregisteredFundSetChecks } from "./fund-gate.js";

describe("unregisteredFundSetChecks", () => {
  it("returns a failing check when no fund sets are registered", () => {
    const checks = unregisteredFundSetChecks(0);
    assert.equal(checks.length, 1);
    assert.equal(checks[0]?.ok, false);
    assert.match(checks[0]?.name ?? "", /at least one fund set is registered/);
  });

  it("returns no checks when at least one fund set is registered", () => {
    assert.deepEqual(unregisteredFundSetChecks(1), []);
    assert.deepEqual(unregisteredFundSetChecks(4), []);
  });
});
