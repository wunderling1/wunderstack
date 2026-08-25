import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * The distribution server actions call assertAdmin and throw Error("forbidden") for non-admins.
 * decideAccess is the pure gate; this documents the contract the actions rely on.
 */
import { decideAccess } from "./authz.js";

test("non-admin session is denied admin area (distribution actions throw forbidden)", () => {
  const fundSession = { user: { role: "fund" as const, tenantId: "oomt" } };
  assert.equal(decideAccess(fundSession, "admin").allow, false);
  // Mirror of assertAdmin: if (!decideAccess(...).allow) throw new Error("forbidden")
  const decision = decideAccess(fundSession, "admin");
  assert.equal(decision.allow, false);
});

test("admin session is allowed admin area (distribution actions proceed)", () => {
  const adminSession = { user: { role: "admin" as const, tenantId: null } };
  assert.equal(decideAccess(adminSession, "admin").allow, true);
});
