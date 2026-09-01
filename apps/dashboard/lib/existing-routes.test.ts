import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * PR-1 DoD: existing routes still resolve after the new shell (no 404).
 * Unauthenticated: /login is 200, gated surfaces redirect (307) to /login.
 * Live check 1 sept 2026 against localhost:3002 (fundKey oomt).
 */
export const UNAUTHENTICATED_ROUTE_STATUS = [
  ["/login", 200],
  ["/password", 307],
  ["/", 307],
  ["/agents", 307],
  ["/agents/cao", 307],
  ["/gesprekken", 307],
  ["/signalen", 307],
  ["/instellingen", 307],
  ["/admin", 307],
  ["/admin/agents", 307],
  ["/admin/agents/cao", 307],
  ["/admin/embed", 307],
  ["/admin/funds", 307],
  ["/admin/funds/oomt", 307],
  ["/admin/funds/oomt/gesprekken", 307],
  ["/admin/funds/oomt/signalen", 307],
  ["/admin/funds/oomt/agents", 307],
  ["/admin/funds/oomt/instellingen", 307],
  ["/admin/funds/oomt/branding", 307],
  ["/admin/funds/oomt/accounts", 307],
  ["/admin/funds/oomt/manage", 307],
  ["/admin/funds/oomt/agents/cao", 307],
  ["/admin/funds/oomt/agents/cao/corpus", 307],
  ["/admin/funds/oomt/agents/cao/publication", 307],
  ["/admin/funds/oomt/agents/cao/distribution", 307],
  ["/admin/funds/oomt/agents/cao/texts", 307],
  ["/admin/funds/oomt/agents/roleplay/scenarios", 307],
  ["/admin/funds/oomt/agents/roleplay/publication", 307],
  ["/admin/funds/oomt/agents/roleplay/lti", 307],
] as const;

test("existing dashboard routes stay reachable (unauthenticated contract)", () => {
  assert.equal(UNAUTHENTICATED_ROUTE_STATUS.length, 29);
  assert.ok(UNAUTHENTICATED_ROUTE_STATUS.every(([, status]) => status === 200 || status === 307));
  assert.equal(UNAUTHENTICATED_ROUTE_STATUS[0]?.[0], "/login");
  assert.equal(UNAUTHENTICATED_ROUTE_STATUS[0]?.[1], 200);
  assert.ok(UNAUTHENTICATED_ROUTE_STATUS.some(([path]) => path === "/gesprekken"));
  assert.ok(UNAUTHENTICATED_ROUTE_STATUS.some(([path]) => path === "/admin/embed"));
  assert.ok(UNAUTHENTICATED_ROUTE_STATUS.some(([path]) => path === "/admin/funds/oomt/branding"));
  assert.ok(UNAUTHENTICATED_ROUTE_STATUS.some(([path]) => path === "/admin/funds/oomt/instellingen"));
});

const origin = process.env.DASHBOARD_ORIGIN;

test("live unauthenticated GETs match the contract", { skip: !origin }, async () => {
  assert.ok(origin);
  for (const [path, expected] of UNAUTHENTICATED_ROUTE_STATUS) {
    const response: Response = await fetch(`${origin}${path}`, { redirect: "manual" });
    assert.equal(response.status, expected, path);
  }
});
