import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { searchPathForRetrieve } from "./retrieve.js";

describe("searchPathForRetrieve (schemaName is the path that was searched)", () => {
  it("defaults to fund_<key>", () => {
    assert.equal(searchPathForRetrieve({ fund: "oomt" }), "fund_oomt");
  });

  it("uses the actual searchPath when provided (copy-identity path)", () => {
    assert.equal(searchPathForRetrieve({ fund: "oomt", searchPath: "public" }), "public");
    assert.equal(searchPathForRetrieve({ fund: "oomt", searchPath: "fund_oomt" }), "fund_oomt");
  });
});
