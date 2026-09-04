import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { opaqueLtiRef } from "./opaque-ref";

describe("opaqueLtiRef", () => {
  it("is stable, hex, and does not preserve an email-shaped input", () => {
    const secret = "lti-session-secret-16";
    const a = opaqueLtiRef(secret, "user", "consumer-1", "naam@fonds.nl");
    const b = opaqueLtiRef(secret, "user", "consumer-1", "naam@fonds.nl");
    const c = opaqueLtiRef(secret, "user", "consumer-1", "other");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a.includes("@"), false);
  });
});
