import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * PR-1 DoD: existing routes still resolve after the new shell (no 404).
 * Unauthenticated: /login is 200, every gated surface redirects (307) to /login.
 *
 * The list is derived from the app tree, not typed out here: a hand-written table can only assert
 * itself, and it stays green when a route is added or deleted. Deriving it means a new page without
 * a declared status, or a declared status for a page that no longer exists, fails this test.
 */
const APP_DIR = join(import.meta.dirname, "../app");

/** Concrete values for dynamic segments — any value works, the redirect happens before rendering. */
const SEGMENT_VALUES: Record<string, string> = {
  "[fundKey]": "oomt",
  "[agentKey]": "cao",
  "[agentId]": "cao",
  "[id]": "11111111-1111-4111-8111-111111111111",
  "[slug]": "gesprek-leidinggevende",
};

/** Only /login renders for a visitor without a session; everything else is a redirect to it. */
const PUBLIC_ROUTES = new Set(["/login"]);

function routePathFor(pageFile: string): string | null {
  const segments: string[] = [];
  for (const segment of pageFile.split("/").slice(0, -1)) {
    // Route groups are organisation, not URL.
    if (segment.startsWith("(") && segment.endsWith(")")) continue;
    if (segment.startsWith("[")) {
      const value = SEGMENT_VALUES[segment];
      // A new dynamic segment must be given a value here rather than silently dropping the route.
      if (value === undefined) return null;
      segments.push(value);
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

function routesFromAppTree(): string[] {
  const pages = readdirSync(APP_DIR, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.split("\\").join("/"))
    .filter((entry) => entry.endsWith("page.tsx"));
  assert.ok(pages.length > 20, "app tree scan found no pages — the path is wrong");

  const routes = pages.map((page) => {
    const route = routePathFor(page);
    assert.ok(route !== null, `unknown dynamic segment in ${page}: add it to SEGMENT_VALUES`);
    return route;
  });
  return [...new Set(routes)].sort();
}

export const UNAUTHENTICATED_ROUTE_STATUS: Array<readonly [string, number]> = routesFromAppTree()
  .map((path) => [path, PUBLIC_ROUTES.has(path) ? 200 : 307] as const);

test("every page in the app tree has a declared unauthenticated status", () => {
  const paths = UNAUTHENTICATED_ROUTE_STATUS.map(([path]) => path);
  assert.ok(paths.includes("/login"));
  assert.ok(paths.includes("/"));

  // The surfaces PR-1 moved or replaced must still answer, not 404.
  for (const path of [
    "/gesprekken",
    "/signalen",
    "/instellingen",
    "/agents/cao",
    "/admin",
    "/admin/funds/oomt",
    "/admin/funds/oomt/instellingen",
    "/admin/embed",
    "/admin/funds/oomt/branding",
  ]) {
    assert.ok(paths.includes(path), `${path} has no page in the app tree`);
  }

  assert.deepEqual(
    UNAUTHENTICATED_ROUTE_STATUS.filter(([, status]) => status === 200).map(([path]) => path),
    ["/login"],
    "only /login may render without a session",
  );
});

const origin = process.env.DASHBOARD_ORIGIN;

/**
 * The only test in this app that hits real routes. Skipped without an origin, so a green run here
 * is not evidence the routes answer — start the dashboard and set DASHBOARD_ORIGIN to get that.
 */
test("live unauthenticated GETs match the contract", { skip: !origin }, async () => {
  assert.ok(origin);
  for (const [path, expected] of UNAUTHENTICATED_ROUTE_STATUS) {
    const response: Response = await fetch(`${origin}${path}`, { redirect: "manual" });
    assert.equal(response.status, expected, path);
  }
});
