import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  signWebhookBody,
  webhookSignatureHeaders,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "./webhook-sign";

describe("signWebhookBody", () => {
  it("is stable for the same timestamp and body", () => {
    const a = signWebhookBody("secret", "1700000000000", "{\"type\":\"ping\"}");
    const b = signWebhookBody("secret", "1700000000000", "{\"type\":\"ping\"}");
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it("changes when the body or the timestamp changes", () => {
    const base = signWebhookBody("secret", "1700000000000", "{\"type\":\"ping\"}");
    assert.notEqual(signWebhookBody("secret", "1700000000001", "{\"type\":\"ping\"}"), base);
    assert.notEqual(signWebhookBody("secret", "1700000000000", "{\"type\":\"cao.updated\"}"), base);
    assert.notEqual(signWebhookBody("other", "1700000000000", "{\"type\":\"ping\"}"), base);
  });
});

describe("webhookSignatureHeaders", () => {
  it("puts the digest and timestamp on the headers the inbound verifier already reads", () => {
    const body = "{\"type\":\"roleplay.result\"}";
    const signed = webhookSignatureHeaders("secret", body, 1_700_000_000_000);
    assert.equal(signed.headers[WEBHOOK_TIMESTAMP_HEADER], "1700000000000");
    assert.equal(signed.headers[WEBHOOK_SIGNATURE_HEADER], signed.signature);
    assert.equal(signed.signature, signWebhookBody("secret", signed.timestamp, body));
  });
});
