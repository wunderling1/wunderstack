import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeFundTab,
  fundTabHref,
  isAgentDetailPath,
  switchFundHref,
} from "./fund-tabs.js";

test("fundTabHref builds overview and nested tab paths", () => {
  assert.equal(fundTabHref("oomt", ""), "/admin/funds/oomt");
  assert.equal(fundTabHref("oomt", "agents"), "/admin/funds/oomt/agents");
  assert.equal(fundTabHref("oomt", "manage"), "/admin/funds/oomt/manage");
});

test("activeFundTab keeps Agents selected on agent detail", () => {
  assert.equal(activeFundTab("/admin/funds/oomt", "oomt"), "");
  assert.equal(activeFundTab("/admin/funds/oomt/agents", "oomt"), "agents");
  assert.equal(activeFundTab("/admin/funds/oomt/agents/cao", "oomt"), "agents");
  assert.equal(activeFundTab("/admin/funds/oomt/branding", "oomt"), "branding");
  assert.equal(activeFundTab("/admin/funds/oomt/accounts", "oomt"), "accounts");
});

test("switchFundHref preserves tab and drops agent detail to agents list", () => {
  assert.equal(
    switchFundHref("/admin/funds/oomt/accounts", "oomt", "demo"),
    "/admin/funds/demo/accounts",
  );
  assert.equal(
    switchFundHref("/admin/funds/oomt/agents/cao", "oomt", "demo"),
    "/admin/funds/demo/agents",
  );
});

test("isAgentDetailPath detects agent instance routes", () => {
  assert.equal(isAgentDetailPath("/admin/funds/oomt/agents/cao", "oomt"), true);
  assert.equal(isAgentDetailPath("/admin/funds/oomt/agents", "oomt"), false);
  assert.equal(isAgentDetailPath("/admin/funds/oomt", "oomt"), false);
});
