import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mintLtiSessionToken, verifyLtiSessionToken } from "./session-token.js";

const SECRET = "lti-session-secret-16";
const LAUNCH_ID = "3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8";

describe("lti session token", () => {
  it("round-trips a payload without a user id or email", () => {
    const token = mintLtiSessionToken({
      launchId: LAUNCH_ID,
      secret: SECRET,
      nowSeconds: 1_000_000,
      ttlSeconds: 60,
    });
    const payload = verifyLtiSessionToken(token, { secret: SECRET, nowSeconds: 1_000_010 });
    assert.deepEqual(payload, { lid: LAUNCH_ID, exp: 1_000_060 });
    assert.equal(payload && "uid" in payload, false);
  });

  it("rejects expiry, tampering, and a length-mismatched signature", () => {
    const token = mintLtiSessionToken({
      launchId: LAUNCH_ID,
      secret: SECRET,
      nowSeconds: 1_000_000,
      ttlSeconds: 10,
    });
    assert.equal(verifyLtiSessionToken(token, { secret: SECRET, nowSeconds: 1_000_010 }), null);
    const [body] = token.split(".");
    assert.equal(verifyLtiSessionToken(`${body}.aaaa`, { secret: SECRET, nowSeconds: 1_000_000 }), null);
    assert.equal(verifyLtiSessionToken(`${token}x`, { secret: SECRET, nowSeconds: 1_000_000 }), null);
    assert.equal(verifyLtiSessionToken(null, { secret: SECRET }), null);
  });
});
