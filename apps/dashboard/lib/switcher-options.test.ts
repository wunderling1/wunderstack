import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAccess } from "./authz.js";
import { ALL_FUNDS_KEY, buildSwitcherOptions } from "./switcher-options.js";

const activeFunds = [
  { key: "oomt", name: "OOMT" },
  { key: "demo", name: "Demo" },
];

test("fund user is not given switcher options (no fund switcher on the fund face)", () => {
  const session = { user: { role: "fund" as const, tenantId: "oomt" } };
  assert.deepEqual(buildSwitcherOptions(session, activeFunds), []);
  assert.equal(decideAccess(session, "fund").allow, true);
  assert.equal(decideAccess(session, "admin").allow, false);
});

test("admin sees Alle fondsen plus active funds", () => {
  const session = { user: { role: "admin" as const, tenantId: null } };
  const options = buildSwitcherOptions(session, activeFunds);
  assert.equal(options[0]?.key, ALL_FUNDS_KEY);
  assert.equal(options[0]?.name, "Alle fondsen");
  assert.deepEqual(
    options.slice(1).map((row) => row.key),
    ["oomt", "demo"],
  );
  assert.equal(decideAccess(session, "admin").allow, true);
});

test("fund user switcher helper returns no keys", () => {
  const session = { user: { role: "fund" as const, tenantId: "demo" } };
  assert.deepEqual(buildSwitcherOptions(session, activeFunds), []);
});
