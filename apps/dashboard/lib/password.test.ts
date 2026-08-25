import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generatePassword,
  GENERATED_PASSWORD_ALPHABET,
  hashPassword,
  verifyPassword,
} from "./password.js";

describe("generatePassword", () => {
  it("returns at least 20 chars from the unambiguous alphabet", () => {
    const password = generatePassword();
    assert.equal(password.length, 20);
    for (const char of password) {
      assert.ok(GENERATED_PASSWORD_ALPHABET.includes(char), `unexpected char ${char}`);
    }
    assert.doesNotMatch(password, /[0O1l]/);
  });

  it("rejects lengths below 20", () => {
    assert.throws(() => generatePassword(19), /at least 20/);
  });

  it("hash/verify still round-trips", () => {
    const password = generatePassword(24);
    const hash = hashPassword(password);
    assert.equal(verifyPassword(password, hash), true);
    assert.equal(verifyPassword("wrong", hash), false);
  });
});
