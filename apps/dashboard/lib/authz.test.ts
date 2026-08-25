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
