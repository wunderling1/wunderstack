import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LTI_TOKEN_HEADER, readLtiToken } from "./request-auth.js";

describe("readLtiToken", () => {
  it("prefers the header over the query so a stripped URL still authenticates fetches", () => {
    const fromHeader = new Request("https://roleplay.example/?ltiToken=from-query", {
      headers: { [LTI_TOKEN_HEADER]: "from-header" },
    });
    assert.equal(readLtiToken(fromHeader), "from-header");
    assert.equal(readLtiToken(new Request("https://roleplay.example/?ltiToken=from-query")), "from-query");
    assert.equal(readLtiToken(new Request("https://roleplay.example/")), null);
  });
});
