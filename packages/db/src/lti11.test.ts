import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  claimedFromExecute,
  generateLti11Credentials,
  LTI11_LAUNCH_TTL_MS,
  toPublicConsumer,
} from "./lti11.js";

describe("generateLti11Credentials", () => {
  it("returns an oauth-safe key and a secret long enough to not be guessable", () => {
    const a = generateLti11Credentials();
    const b = generateLti11Credentials();
    assert.match(a.consumerKey, /^lti11_[0-9a-f]{24}$/);
    assert.equal(a.consumerSecret.length, 64);
    assert.notEqual(a.consumerKey, b.consumerKey);
    assert.notEqual(a.consumerSecret, b.consumerSecret);
  });
});

describe("toPublicConsumer", () => {
  it("drops the shared secret so a list response cannot leak it", () => {
    const publicRow = toPublicConsumer({
      id: "3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8",
      fundKey: "demo",
      name: "Moodle",
      consumerKey: "lti11_abc",
      consumerSecret: "super-secret",
      status: "active",
      gradePassbackEnabled: false,
      createdAt: new Date("2026-08-25T00:00:00.000Z"),
      updatedAt: new Date("2026-08-25T00:00:00.000Z"),
    });
    assert.equal("consumerSecret" in publicRow, false);
    assert.equal(publicRow.consumerKey, "lti11_abc");
  });
});

describe("claimedFromExecute", () => {
  it("reads the boolean from both array and { rows } driver shapes", () => {
    assert.equal(claimedFromExecute([{ claimed: true }]), true);
    assert.equal(claimedFromExecute({ rows: [{ claimed: true }] }), true);
    assert.equal(claimedFromExecute([{ claimed: false }]), false);
    assert.equal(claimedFromExecute([]), false);
  });
});

describe("LTI11_LAUNCH_TTL_MS", () => {
  it("matches the 4-hour session-token TTL", () => {
    assert.equal(LTI11_LAUNCH_TTL_MS, 4 * 60 * 60 * 1000);
  });
});
