import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSignatureBaseString,
  computeBodyHash,
  computeSignature,
  pctEncode,
  validateSignature,
} from "./oauth";

describe("pctEncode", () => {
  it("encodes RFC 3986 reserved chars that encodeURIComponent leaves alone", () => {
    assert.equal(pctEncode("!'()*"), "%21%27%28%29%2A");
    assert.equal(pctEncode("AZaz09-._~"), "AZaz09-._~");
  });
});

describe("validateSignature", () => {
  const secret = "super-secret";
  const baseUrl = "https://roleplay.example/api/lti11/launch/gesprek/vca";
  const params = {
    oauth_consumer_key: "key-1",
    oauth_nonce: "n-1",
    oauth_timestamp: "1788000000",
    oauth_signature_method: "HMAC-SHA1",
    lti_message_type: "basic-lti-launch-request",
    user_id: "u-9",
  };

  it("accepts a signature it just computed, and rejects a tampered one", () => {
    const signature = computeSignature(buildSignatureBaseString("POST", baseUrl, params), secret);
    assert.equal(validateSignature("POST", baseUrl, { ...params, oauth_signature: signature }, secret), true);
    assert.equal(
      validateSignature("POST", baseUrl, { ...params, oauth_signature: `${signature}x` }, secret),
      false,
    );
  });

  it("returns false on a length-mismatched signature instead of throwing on timingSafeEqual", () => {
    assert.equal(validateSignature("POST", baseUrl, { ...params, oauth_signature: "short" }, secret), false);
    assert.equal(validateSignature("POST", baseUrl, params, secret), false);
  });
});

describe("computeBodyHash", () => {
  it("is base64(sha1(body)) — SHA-1 of the empty string is the well-known digest", () => {
    assert.equal(computeBodyHash(""), "2jmj7l5rSw0yVb/vlWAYkK/YBwk=");
  });
});
