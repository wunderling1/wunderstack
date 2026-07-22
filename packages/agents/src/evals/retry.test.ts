import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isRetryableError, retryWithBackoff } from "./retry.js";

/** Reproduce undici's `fetch failed` shape: a TypeError wrapping the real cause. */
function fetchFailed(cause: Error): TypeError {
  const error = new TypeError("fetch failed");
  (error as { cause?: unknown }).cause = cause;
  return error;
}

/** An Error carrying a Node-style `code`, as socket/DNS failures do. */
function withCode(message: string, code: string): Error {
  const error = new Error(message);
  (error as { code?: unknown }).code = code;
  return error;
}

describe("isRetryableError", () => {
  it("retries rate limits (429 and 'rate limit')", () => {
    assert.equal(isRetryableError(new Error("Request failed with status 429")), true);
    assert.equal(isRetryableError(new Error("rate limit exceeded")), true);
  });

  it("retries undici 'fetch failed' via the message", () => {
    assert.equal(isRetryableError(new TypeError("fetch failed")), true);
  });

  it("retries a transient network code nested in error.cause", () => {
    assert.equal(isRetryableError(fetchFailed(withCode("read ECONNRESET", "ECONNRESET"))), true);
    assert.equal(
      isRetryableError(fetchFailed(withCode("connect timeout", "UND_ERR_CONNECT_TIMEOUT"))),
      true,
    );
  });

  it("retries a top-level network code", () => {
    assert.equal(isRetryableError(withCode("getaddrinfo EAI_AGAIN", "EAI_AGAIN")), true);
  });

  it("does NOT retry a genuine non-transient error", () => {
    assert.equal(isRetryableError(new Error("400 Bad Request: invalid schema")), false);
    assert.equal(isRetryableError(new Error("boom")), false);
  });

  it("tolerates a cyclic cause chain without hanging", () => {
    const a = new Error("a");
    const b = new Error("b");
    (a as { cause?: unknown }).cause = b;
    (b as { cause?: unknown }).cause = a;
    assert.equal(isRetryableError(a), false);
  });
});

describe("retryWithBackoff", () => {
  it("retries a transient 'fetch failed' and eventually succeeds", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      () => {
        calls += 1;
        if (calls < 3) {
          return Promise.reject(fetchFailed(withCode("read ECONNRESET", "ECONNRESET")));
        }
        return Promise.resolve("ok");
      },
      { maxAttempts: 5, baseDelayMs: 1 },
    );
    assert.equal(result, "ok");
    assert.equal(calls, 3);
  });

  it("does not retry a non-transient error (throws on first attempt)", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        retryWithBackoff(
          () => {
            calls += 1;
            return Promise.reject(new Error("400 Bad Request"));
          },
          { maxAttempts: 5, baseDelayMs: 1 },
        ),
      /400 Bad Request/,
    );
    assert.equal(calls, 1);
  });

  it("gives up after maxAttempts on a persistent transient error", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        retryWithBackoff(
          () => {
            calls += 1;
            return Promise.reject(new TypeError("fetch failed"));
          },
          { maxAttempts: 3, baseDelayMs: 1 },
        ),
      /fetch failed/,
    );
    assert.equal(calls, 3);
  });
});
