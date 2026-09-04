import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { instanceBelongsToProcess } from "./embed-auth";

describe("instanceBelongsToProcess (D15 wall, track B)", () => {
  it("accepts a key for this process tenant", () => {
    assert.equal(instanceBelongsToProcess({ tenantId: "demo" }, "demo"), true);
  });

  it("rejects a key from another tenant (403 path in resolveEmbedAuth)", () => {
    assert.equal(instanceBelongsToProcess({ tenantId: "oomt" }, "demo"), false);
  });
});
