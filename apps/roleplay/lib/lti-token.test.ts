import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appendLtiToken, ltiAuthHeaders, LTI_TOKEN_HEADER } from "./lti-token.js";

describe("appendLtiToken", () => {
  it("is a no-op without a token and preserves a hash", () => {
    assert.equal(appendLtiToken("/?scenario=a", null), "/?scenario=a");
    assert.equal(
      appendLtiToken("/?scenario=a#top", "tok"),
      "/?scenario=a&ltiToken=tok#top",
    );
  });
});

describe("ltiAuthHeaders", () => {
  it("sends the token only when present", () => {
    assert.deepEqual(ltiAuthHeaders(null), {});
    assert.deepEqual(ltiAuthHeaders("tok"), { [LTI_TOKEN_HEADER]: "tok" });
  });
});
