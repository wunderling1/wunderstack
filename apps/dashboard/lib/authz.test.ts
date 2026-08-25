import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAccess } from "./authz.js";

test("anonymous is redirected to login for both areas", () => {
  assert.deepEqual(decideAccess(null, "fund"), { allow: false, redirectTo: "/login" });
  assert.deepEqual(decideAccess(null, "admin"), { allow: false, redirectTo: "/login" });
  assert.deepEqual(decideAccess(null, "password"), { allow: false, redirectTo: "/login" });
});

test("fund user is denied the admin area (redirected to fund home)", () => {
  const session = { user: { role: "fund" as const, tenantId: "oomt" } };
  assert.deepEqual(decideAccess(session, "admin"), { allow: false, redirectTo: "/" });
  assert.deepEqual(decideAccess(session, "fund"), { allow: true });
});

test("admin is denied the tenant-scoped fund area (redirected to admin)", () => {
  const session = { user: { role: "admin" as const, tenantId: null } };
  assert.deepEqual(decideAccess(session, "fund"), { allow: false, redirectTo: "/admin" });
  assert.deepEqual(decideAccess(session, "admin"), { allow: true });
});

test("fund user without a tenant cannot enter the fund area", () => {
  const session = { user: { role: "fund" as const, tenantId: null } };
  assert.deepEqual(decideAccess(session, "fund"), { allow: false, redirectTo: "/login" });
});

test("mustChangePassword forces fund and admin to /password", () => {
  const fund = {
    user: { role: "fund" as const, tenantId: "oomt", mustChangePassword: true },
  };
  assert.deepEqual(decideAccess(fund, "fund"), { allow: false, redirectTo: "/password" });
  assert.deepEqual(decideAccess(fund, "admin"), { allow: false, redirectTo: "/password" });
  assert.deepEqual(decideAccess(fund, "password"), { allow: true });
});

test("admin with mustChangePassword cannot enter /admin", () => {
  const session = {
    user: { role: "admin" as const, tenantId: null, mustChangePassword: true },
  };
  assert.deepEqual(decideAccess(session, "admin"), { allow: false, redirectTo: "/password" });
  assert.deepEqual(decideAccess(session, "password"), { allow: true });
});

test("password area redirects away once the flag is cleared", () => {
  assert.deepEqual(
    decideAccess({ user: { role: "fund" as const, tenantId: "oomt" } }, "password"),
    { allow: false, redirectTo: "/" },
  );
  assert.deepEqual(
    decideAccess({ user: { role: "admin" as const, tenantId: null } }, "password"),
    { allow: false, redirectTo: "/admin" },
  );
});

test("fund face routes stay fund-scoped: fund user may enter fund area, never admin", () => {
  // Fund routes (/ and /agents/[agentKey]) use session.tenantId only — no fundKey in the URL.
  // decideAccess("fund") is the gate; a fund user of A cannot open admin to reach fund B.
  const fundA = { user: { role: "fund" as const, tenantId: "fonds-a" } };
  assert.deepEqual(decideAccess(fundA, "fund"), { allow: true });
  assert.deepEqual(decideAccess(fundA, "admin"), { allow: false, redirectTo: "/" });
});

test("fund user of fonds-a is still denied admin (no path to fonds-b data via admin)", () => {
  const fundA = { user: { role: "fund" as const, tenantId: "fonds-a" } };
  const fundB = { user: { role: "fund" as const, tenantId: "fonds-b" } };
  assert.equal(decideAccess(fundA, "admin").allow, false);
  assert.equal(decideAccess(fundB, "admin").allow, false);
  assert.equal(decideAccess(fundA, "fund").allow, true);
  assert.equal(decideAccess(fundB, "fund").allow, true);
  // Isolation of KPI data is enforced by pages reading session.user.tenantId only
  // (see app/(fund)/agents/[agentKey]/page.tsx) — never a URL fundKey.
});
