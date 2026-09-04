import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAgentKey, parseFundKey } from "./route-params";

test("parseFundKey accepts known fund key shapes", () => {
  assert.equal(parseFundKey("oomt"), "oomt");
  assert.equal(parseFundKey("elektronische-detailhandel"), "elektronische-detailhandel");
  assert.equal(parseFundKey("OOMT"), "oomt");
});

test("parseFundKey returns null for unknown or invalid fund key", () => {
  assert.equal(parseFundKey("not-a-valid..key"), null);
  assert.equal(parseFundKey("../control"), null);
  assert.equal(parseFundKey("fund_oomt"), null);
  assert.equal(parseFundKey(""), null);
});

test("parseAgentKey returns null for agent without a known key (notFound path)", () => {
  assert.equal(parseAgentKey("cao"), "cao");
  assert.equal(parseAgentKey("roleplay"), "roleplay");
  assert.equal(parseAgentKey("CAO"), "cao");
  assert.equal(parseAgentKey("unknown-agent"), null);
  assert.equal(parseAgentKey(""), null);
});
