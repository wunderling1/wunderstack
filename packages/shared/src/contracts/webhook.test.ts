import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { webhookEventRequiresFund, webhookEventSchema } from "./webhook.js";

describe("webhookEventSchema", () => {
  it("accepts a ping without a fund", () => {
    assert.ok(webhookEventSchema.safeParse({ type: "ping" }).success);
    assert.equal(webhookEventRequiresFund("ping"), false);
  });

  it("accepts cao.updated and roleplay.result as first-class types", () => {
    assert.ok(webhookEventSchema.safeParse({ type: "cao.updated", fund: "demo" }).success);
    assert.ok(webhookEventSchema.safeParse({ type: "roleplay.result", fund: "demo" }).success);
    assert.equal(webhookEventRequiresFund("cao.updated"), true);
    assert.equal(webhookEventRequiresFund("roleplay.result"), true);
  });

  it("rejects an unknown type rather than silently ignoring it", () => {
    assert.ok(!webhookEventSchema.safeParse({ type: "ingest.please" }).success);
  });
});
