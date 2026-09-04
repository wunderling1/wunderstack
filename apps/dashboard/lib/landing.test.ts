import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAccess } from "./authz";

test("landing: already logged in on /login redirects fund to / and admin to /admin", () => {
  const fund = { user: { role: "fund" as const, tenantId: "oomt" } };
  const admin = { user: { role: "admin" as const, tenantId: null } };

  assert.equal(decideAccess(fund, "fund").allow, true);
  assert.equal(decideAccess(admin, "admin").allow, true);

  // Mirrors login/page.tsx redirect targets when session exists.
  const fundRedirect = decideAccess(fund, "fund").allow ? "/" : "/login";
  const adminRedirect = decideAccess(admin, "admin").allow ? "/admin" : "/login";
  assert.equal(fundRedirect, "/");
  assert.equal(adminRedirect, "/admin");
});

test("landing: mustChangePassword forces /password for fund and admin", () => {
  const fund = {
    user: { role: "fund" as const, tenantId: "oomt", mustChangePassword: true },
  };
  const admin = {
    user: { role: "admin" as const, tenantId: null, mustChangePassword: true },
  };

  assert.deepEqual(decideAccess(fund, "fund"), { allow: false, redirectTo: "/password" });
  assert.deepEqual(decideAccess(admin, "admin"), { allow: false, redirectTo: "/password" });
  assert.deepEqual(decideAccess(fund, "password"), { allow: true });
});

test("landing: after password change fund goes to / and admin to /admin", () => {
  assert.deepEqual(
    decideAccess({ user: { role: "fund" as const, tenantId: "oomt" } }, "password"),
    { allow: false, redirectTo: "/" },
  );
  assert.deepEqual(
    decideAccess({ user: { role: "admin" as const, tenantId: null } }, "password"),
    { allow: false, redirectTo: "/admin" },
  );
});
