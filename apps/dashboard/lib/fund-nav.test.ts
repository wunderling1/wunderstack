import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  activeFundNavSegment,
  chromeNavLinks,
  fundNavHref,
  parseAdminChromePath,
  switchFundNavHref,
} from "./fund-nav.js";
import { ALL_FUNDS_KEY } from "./switcher-options.js";

test("fundNavHref builds fund-face and admin paths", () => {
  assert.equal(fundNavHref("fund", "oomt", ""), "/");
  assert.equal(fundNavHref("fund", "oomt", "gesprekken"), "/gesprekken");
  assert.equal(fundNavHref("admin", "oomt", ""), "/admin/funds/oomt");
  assert.equal(fundNavHref("admin", "oomt", "signalen"), "/admin/funds/oomt/signalen");
});

test("activeFundNavSegment selects sidebar item including agent detail", () => {
  assert.equal(activeFundNavSegment("/", "fund", "oomt"), "");
  assert.equal(activeFundNavSegment("/gesprekken", "fund", "oomt"), "gesprekken");
  assert.equal(activeFundNavSegment("/agents/cao", "fund", "oomt"), "agents");
  assert.equal(activeFundNavSegment("/admin/funds/oomt", "admin", "oomt"), "");
  assert.equal(activeFundNavSegment("/admin/funds/oomt/instellingen", "admin", "oomt"), "instellingen");
  assert.equal(activeFundNavSegment("/admin/funds/oomt/branding", "admin", "oomt"), "instellingen");
  assert.equal(activeFundNavSegment("/admin/funds/oomt/agents/cao", "admin", "oomt"), "agents");
});

test("parseAdminChromePath treats /admin and /admin/funds as Alle fondsen", () => {
  assert.deepEqual(parseAdminChromePath("/admin"), {
    nav: "platform",
    fundKey: null,
    switcherKey: ALL_FUNDS_KEY,
  });
  assert.deepEqual(parseAdminChromePath("/admin/funds"), {
    nav: "platform",
    fundKey: null,
    switcherKey: ALL_FUNDS_KEY,
  });
  assert.deepEqual(parseAdminChromePath("/admin/agents"), {
    nav: "platform",
    fundKey: null,
    switcherKey: ALL_FUNDS_KEY,
  });
  assert.deepEqual(parseAdminChromePath("/admin/funds/oomt/gesprekken"), {
    nav: "fund",
    fundKey: "oomt",
    switcherKey: "oomt",
  });
});

test("chromeNavLinks on Alle fondsen uses platform items", () => {
  const links = chromeNavLinks({
    view: "admin",
    nav: "platform",
    fundKey: ALL_FUNDS_KEY,
    pathname: "/admin",
  });
  assert.deepEqual(
    links.map((row) => row.href),
    ["/admin", "/admin/funds", "/admin/agents"],
  );
  assert.equal(links[0]?.selected, true);
});

test("chromeNavLinks on a fund uses the five fund items", () => {
  const links = chromeNavLinks({
    view: "admin",
    nav: "fund",
    fundKey: "oomt",
    pathname: "/admin/funds/oomt/signalen",
  });
  assert.equal(links.length, 5);
  assert.equal(links.find((row) => row.label === "Signalen")?.selected, true);
});

test("switchFundNavHref preserves section and drops agent detail to agents list", () => {
  assert.equal(
    switchFundNavHref("/admin/funds/oomt/gesprekken", "oomt", "demo"),
    "/admin/funds/demo/gesprekken",
  );
  assert.equal(
    switchFundNavHref("/admin/funds/oomt/agents/cao", "oomt", "demo"),
    "/admin/funds/demo/agents",
  );
  assert.equal(
    switchFundNavHref("/admin/funds/oomt/branding", "oomt", "demo"),
    "/admin/funds/demo/instellingen",
  );
  assert.equal(
    switchFundNavHref("/admin/funds/oomt/accounts", "oomt", "demo"),
    "/admin/funds/demo/instellingen",
  );
});

test("switchFundNavHref maps Alle fondsen to and from a fund", () => {
  assert.equal(
    switchFundNavHref("/admin", ALL_FUNDS_KEY, "oomt"),
    "/admin/funds/oomt",
  );
  assert.equal(
    switchFundNavHref("/admin/agents", ALL_FUNDS_KEY, "oomt"),
    "/admin/funds/oomt/agents",
  );
  assert.equal(
    switchFundNavHref("/admin/funds/oomt/gesprekken", "oomt", ALL_FUNDS_KEY),
    "/admin",
  );
  assert.equal(
    switchFundNavHref("/admin/funds/oomt/agents", "oomt", ALL_FUNDS_KEY),
    "/admin/agents",
  );
});

test("fund and admin layouts are server components (no use client)", () => {
  for (const relative of ["../app/(fund)/layout.tsx", "../app/(admin)/layout.tsx"]) {
    const source = readFileSync(join(import.meta.dirname, relative), "utf8");
    assert.equal(source.includes('"use client"'), false, relative);
  }
});
