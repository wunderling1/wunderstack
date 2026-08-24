import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertOpaqueConnectionKey, connectionEnvName, resolveConnection } from "./connection-key.js";

describe("assertOpaqueConnectionKey", () => {
  it("accepts null and empty as the shared addon", () => {
    assert.equal(assertOpaqueConnectionKey(null), null);
    assert.equal(assertOpaqueConnectionKey(undefined), null);
    assert.equal(assertOpaqueConnectionKey(""), null);
    assert.equal(assertOpaqueConnectionKey("   "), null);
  });

  it("accepts an opaque key", () => {
    assert.equal(assertOpaqueConnectionKey("OOMT_PROMO"), "OOMT_PROMO");
  });

  it("rejects a URL / DSN", () => {
    assert.throws(() => assertOpaqueConnectionKey("postgres://user:pass@host/db"), /never a URL/);
    assert.throws(() => assertOpaqueConnectionKey("https://example.invalid/db"), /never a URL/);
  });
});

describe("resolveConnection", () => {
  it("throws on an unknown key and does not fall back to DATABASE_URL", () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://shared.example.invalid/wunderstack";
    delete process.env.WUNDERSTACK_DB_URL_MISSING;
    try {
      assert.throws(() => resolveConnection("MISSING"), /Unknown or unset connection key/);
      assert.throws(() => resolveConnection("not-a-key"), /Unknown connection key/);
      assert.notEqual(process.env.DATABASE_URL, undefined);
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
    }
  });

  it("returns only the closed-set env var for a known key", () => {
    const envName = connectionEnvName("PROMO");
    const previous = process.env[envName];
    process.env[envName] = "postgres://promo.example.invalid/fund";
    try {
      assert.equal(resolveConnection("PROMO"), "postgres://promo.example.invalid/fund");
    } finally {
      if (previous === undefined) {
        delete process.env[envName];
      } else {
        process.env[envName] = previous;
      }
    }
  });
});
