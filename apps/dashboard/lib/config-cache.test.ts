import assert from "node:assert/strict";
import { test } from "node:test";
import { FUNDS_INDEX_TAG, fundConfigTag, instanceConfigTag } from "./config-cache.js";

test("config cache tags are scoped and stable", () => {
  assert.equal(FUNDS_INDEX_TAG, "dashboard-funds-index");
  assert.equal(fundConfigTag("oomt"), "dashboard-fund:oomt");
  assert.equal(instanceConfigTag("oomt", "cao"), "dashboard-instance:oomt:cao");
});
