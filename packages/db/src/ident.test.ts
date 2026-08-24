import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertFundKey, quoteIdent, quoteLiteral } from "./ident.js";

describe("assertFundKey", () => {
  it("accepts hyphenated fund keys", () => {
    assert.equal(assertFundKey("elektronische-detailhandel"), "elektronische-detailhandel");
    assert.equal(assertFundKey("oomt"), "oomt");
  });

  it("rejects SQL metacharacters", () => {
    assert.throws(() => assertFundKey("oomt; drop schema public"), /Invalid fund key/);
    assert.throws(() => assertFundKey("fund_oomt"), /Invalid fund key/);
  });
});

describe("quoteIdent", () => {
  it("quotes hyphenated schema names", () => {
    assert.equal(quoteIdent("fund_elektronische-detailhandel"), '"fund_elektronische-detailhandel"');
  });

  it("rejects identifiers outside the allowed alphabet", () => {
    assert.throws(() => quoteIdent('foo"; drop table chunks --'), /unsafe SQL identifier/);
  });
});

describe("quoteLiteral", () => {
  it("escapes single quotes", () => {
    assert.equal(quoteLiteral("a'b"), "'a''b'");
  });
});
