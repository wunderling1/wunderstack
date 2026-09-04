import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextDeliveryAttemptAt, ROLEPLAY_DELIVERY_MAX_ATTEMPTS } from "./delivery-store";

describe("nextDeliveryAttemptAt", () => {
  const now = new Date("2026-08-25T16:00:00.000Z");

  it("backs off 30s, 2m, 8m, 32m so a brief outage is retried and a dead endpoint is not hammered", () => {
    assert.equal(nextDeliveryAttemptAt(1, now).toISOString(), "2026-08-25T16:00:30.000Z");
    assert.equal(nextDeliveryAttemptAt(2, now).toISOString(), "2026-08-25T16:02:00.000Z");
    assert.equal(nextDeliveryAttemptAt(3, now).toISOString(), "2026-08-25T16:08:00.000Z");
    assert.equal(nextDeliveryAttemptAt(4, now).toISOString(), "2026-08-25T16:32:00.000Z");
  });

  it("gives up on the fifth attempt — that is the floor the claimer treats as terminal", () => {
    assert.equal(ROLEPLAY_DELIVERY_MAX_ATTEMPTS, 5);
  });
});
