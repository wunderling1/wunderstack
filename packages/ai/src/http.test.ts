import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isRateLimited,
  isTransientProviderError,
  ProviderHttpError,
} from "./http";

describe("isRateLimited / isTransientProviderError", () => {
  it("isRateLimited is only 429", () => {
    assert.equal(isRateLimited(new ProviderHttpError("Mistral request", 429, "throttled")), true);
    assert.equal(isRateLimited(new ProviderHttpError("Mistral request", 503, "unavailable")), false);
    assert.equal(isRateLimited(new Error("429")), false);
  });

  it("isTransientProviderError covers 429 and retryable 5xx", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      assert.equal(
        isTransientProviderError(new ProviderHttpError("Mistral request", status, "x")),
        true,
        String(status),
      );
    }
  });

  it("isTransientProviderError rejects non-transient statuses and plain Errors", () => {
    assert.equal(isTransientProviderError(new ProviderHttpError("Mistral request", 400, "bad")), false);
    assert.equal(isTransientProviderError(new ProviderHttpError("Mistral request", 401, "auth")), false);
    assert.equal(isTransientProviderError(new Error("Mistral request failed (503)")), false);
  });
});
