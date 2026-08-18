import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { beforeEach, describe, it } from "node:test";

import {
  resetMcpAuthReplayCacheForTests,
  verifyMcpAuthWithCredentials,
  verifyMcpBearerWithTokens,
  verifyMcpHostAgainstAllowlist,
  verifyMcpSignatureWithSecrets,
} from "./mcp-auth.js";

describe("mcp-auth", () => {
  const CURRENT = "current-secret-value-abcdefghijklmnopqrstuvwxyz";
  const PREVIOUS = "previous-secret-value-abcdefghijklmnopqrstuv";
  const TOKEN_CURRENT = "token-current-abcdefghijklmnopqrstuvwxyz012345";
  const TOKEN_PREVIOUS = "token-previous-abcdefghijklmnopqrstuvwxyz0123";

  beforeEach(() => {
    resetMcpAuthReplayCacheForTests();
  });

  function sign(secret: string, timestamp: string, rawBody: string): string {
    return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  }

  function requestWith(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/mcp", { method: "POST", headers });
  }

  it("rejects when no secret is configured", () => {
    const result = verifyMcpSignatureWithSecrets(requestWith({}), "{}", []);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
      assert.equal(result.error, "mcp_not_configured");
    }
  });

  it("accepts a valid signature with the current secret", () => {
    const timestamp = String(Date.now());
    const raw = `{"jsonrpc":"2.0","method":"ping","id":1}`;
    const result = verifyMcpSignatureWithSecrets(
      requestWith({
        "x-wunderstack-signature": sign(CURRENT, timestamp, raw),
        "x-wunderstack-timestamp": timestamp,
      }),
      raw,
      [CURRENT, PREVIOUS],
    );
    assert.equal(result.ok, true);
  });

  it("accepts a valid signature with the previous secret (rotation without downtime)", () => {
    const timestamp = String(Date.now());
    const raw = `{"jsonrpc":"2.0","method":"tools/list","id":2}`;
    const result = verifyMcpSignatureWithSecrets(
      requestWith({
        "x-wunderstack-signature": sign(PREVIOUS, timestamp, raw),
        "x-wunderstack-timestamp": timestamp,
      }),
      raw,
      [CURRENT, PREVIOUS],
    );
    assert.equal(result.ok, true);
  });

  it("rejects missing signature headers", () => {
    const result = verifyMcpSignatureWithSecrets(requestWith({}), "{}", [CURRENT]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.equal(result.error, "missing_signature");
    }
  });

  it("rejects an invalid signature", () => {
    const timestamp = String(Date.now());
    const raw = "{}";
    const result = verifyMcpSignatureWithSecrets(
      requestWith({
        "x-wunderstack-signature": sign("wrong-secret", timestamp, raw),
        "x-wunderstack-timestamp": timestamp,
      }),
      raw,
      [CURRENT],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "invalid_signature");
    }
  });

  it("rejects a replayed signature within the window", () => {
    const timestamp = String(Date.now());
    const raw = `{"jsonrpc":"2.0","id":3}`;
    const headers = {
      "x-wunderstack-signature": sign(CURRENT, timestamp, raw),
      "x-wunderstack-timestamp": timestamp,
    };
    assert.equal(verifyMcpSignatureWithSecrets(requestWith(headers), raw, [CURRENT]).ok, true);
    const replay = verifyMcpSignatureWithSecrets(requestWith(headers), raw, [CURRENT]);
    assert.equal(replay.ok, false);
    if (!replay.ok) {
      assert.equal(replay.error, "replayed_request");
    }
  });

  it("rejects a stale timestamp", () => {
    const timestamp = String(Date.now() - 10 * 60 * 1000);
    const raw = "{}";
    const result = verifyMcpSignatureWithSecrets(
      requestWith({
        "x-wunderstack-signature": sign(CURRENT, timestamp, raw),
        "x-wunderstack-timestamp": timestamp,
      }),
      raw,
      [CURRENT],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "stale_timestamp");
    }
  });

  it("accepts a valid bearer token", () => {
    const result = verifyMcpBearerWithTokens(
      requestWith({ authorization: `Bearer ${TOKEN_CURRENT}` }),
      [TOKEN_CURRENT, TOKEN_PREVIOUS],
    );
    assert.equal(result.ok, true);
  });

  it("accepts the previous bearer token (rotation without downtime)", () => {
    const result = verifyMcpBearerWithTokens(
      requestWith({ authorization: `Bearer ${TOKEN_PREVIOUS}` }),
      [TOKEN_CURRENT, TOKEN_PREVIOUS],
    );
    assert.equal(result.ok, true);
  });

  it("treats the bearer scheme name as case-insensitive", () => {
    const result = verifyMcpBearerWithTokens(
      requestWith({ authorization: `bearer ${TOKEN_CURRENT}` }),
      [TOKEN_CURRENT],
    );
    assert.equal(result.ok, true);
  });

  it("rejects an unknown bearer token", () => {
    const result = verifyMcpBearerWithTokens(
      requestWith({ authorization: "Bearer not-the-configured-token-0123456789abc" }),
      [TOKEN_CURRENT],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.equal(result.error, "invalid_bearer");
    }
  });

  it("rejects a bearer token of a different length without throwing", () => {
    const result = verifyMcpBearerWithTokens(requestWith({ authorization: "Bearer short" }), [
      TOKEN_CURRENT,
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "invalid_bearer");
    }
  });

  it("rejects a non-bearer authorization scheme", () => {
    const result = verifyMcpBearerWithTokens(requestWith({ authorization: "Basic dXNlcjpwYXNz" }), [
      TOKEN_CURRENT,
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "malformed_bearer");
    }
  });

  it("rejects bearer auth when no token is configured", () => {
    const result = verifyMcpBearerWithTokens(
      requestWith({ authorization: `Bearer ${TOKEN_CURRENT}` }),
      [],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "bearer_not_configured");
    }
  });

  it("rejects when neither scheme is configured", () => {
    const result = verifyMcpAuthWithCredentials(requestWith({}), "{}", {
      bearerTokens: [],
      signingSecrets: [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
      assert.equal(result.error, "mcp_not_configured");
    }
  });

  it("routes a request with Authorization to the bearer scheme", () => {
    const result = verifyMcpAuthWithCredentials(
      requestWith({ authorization: `Bearer ${TOKEN_CURRENT}` }),
      "{}",
      { bearerTokens: [TOKEN_CURRENT], signingSecrets: [CURRENT] },
    );
    assert.equal(result.ok, true);
  });

  it("does not fall back to HMAC when a bearer token is wrong", () => {
    const timestamp = String(Date.now());
    const raw = "{}";
    const result = verifyMcpAuthWithCredentials(
      requestWith({
        authorization: "Bearer wrong-token-abcdefghijklmnopqrstuvwxyz01",
        // A valid signature must not rescue a rejected bearer.
        "x-wunderstack-signature": sign(CURRENT, timestamp, raw),
        "x-wunderstack-timestamp": timestamp,
      }),
      raw,
      { bearerTokens: [TOKEN_CURRENT], signingSecrets: [CURRENT] },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "invalid_bearer");
    }
  });

  it("returns 401 (not 503) for a credential-less request when only bearer is configured", () => {
    const result = verifyMcpAuthWithCredentials(requestWith({}), "{}", {
      bearerTokens: [TOKEN_CURRENT],
      signingSecrets: [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.equal(result.error, "missing_credentials");
    }
  });

  it("routes a request without Authorization to the HMAC scheme", () => {
    const timestamp = String(Date.now());
    const raw = `{"jsonrpc":"2.0","method":"tools/list","id":9}`;
    const result = verifyMcpAuthWithCredentials(
      requestWith({
        "x-wunderstack-signature": sign(CURRENT, timestamp, raw),
        "x-wunderstack-timestamp": timestamp,
      }),
      raw,
      { bearerTokens: [TOKEN_CURRENT], signingSecrets: [CURRENT] },
    );
    assert.equal(result.ok, true);
  });

  it("allows any host when the allowlist is unset", () => {
    const result = verifyMcpHostAgainstAllowlist(
      new Request("http://evil.example/api/mcp", { headers: { host: "evil.example" } }),
      undefined,
    );
    assert.equal(result.ok, true);
  });

  it("rejects a host not on the allowlist", () => {
    const result = verifyMcpHostAgainstAllowlist(
      new Request("http://evil.example/api/mcp", { headers: { host: "evil.example" } }),
      "api.example.nl,localhost:3000",
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "host_not_allowed");
    }
  });

  it("accepts a host on the allowlist", () => {
    const result = verifyMcpHostAgainstAllowlist(
      new Request("http://api.example.nl/api/mcp", { headers: { host: "api.example.nl" } }),
      "api.example.nl,localhost:3000",
    );
    assert.equal(result.ok, true);
  });
});
