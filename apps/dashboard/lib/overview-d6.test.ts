import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * These are source guards, not behaviour tests: this repo has no DOM renderer, so what a block
 * puts on screen cannot be asserted here. They prove a block still reaches for MeasurementNote —
 * that the note carries a usable date is asserted against a real schema in
 * packages/analytics/src/fund-environment.integration.test.ts.
 */
test("every split that shows a rate also shows when measurement started (D6)", () => {
  const view = readFileSync(join(import.meta.dirname, "../components/fund/overview.tsx"), "utf8");

  // Sliced per block rather than counted, so an unrelated block does not move the number. The
  // next declaration may be `async function` since the sections fetch their own model.
  for (const block of ["StatusBlock", "ActionsBlock"]) {
    const start = view.indexOf(`function ${block}(`);
    assert.notEqual(start, -1, `${block} must exist`);
    const rest = view.slice(start + 1);
    const nextPlain = rest.indexOf("\nfunction ");
    const nextAsync = rest.indexOf("\nasync function ");
    const ends = [nextPlain, nextAsync].filter((index) => index !== -1);
    const body = ends.length === 0 ? rest : rest.slice(0, Math.min(...ends));
    assert.match(body, /MeasurementNote/, `${block} shows a rate, so it must show D6`);
  }
});

test("overview loader uses one parsed period for current and previous windows", () => {
  const source = readFileSync(join(import.meta.dirname, "./overview-load.ts"), "utf8");
  assert.match(source, /currentWindow\(period/);
  assert.match(source, /previousWindow\(current\)/);
  // Both windows travel to the database as one pair, so the two halves of every comparison come
  // from a single pass over the same rows.
  assert.match(source, /overviewWindows\(period, nowMs\)/);
  assert.match(source, /getActivitySnapshot\(\{\s*fundKey,\s*windows,/);
  assert.doesNotMatch(source, /sinceDaysAgo\(30\)/);
});

test("the overview reads per window, never per agent", () => {
  const source = readFileSync(join(import.meta.dirname, "./overview-load.ts"), "utf8");
  // The D6 loader ran two queries inside `instances.map(async ...)`, so a fund with a third agent
  // paid two more transactions per page view. Agent rows now come from one `group by agent_id`.
  assert.doesNotMatch(source, /instances\.map\(async/);
  assert.match(source, /getAgentSnapshot\(/);
});

test("overview pages do not query KPI SQL locally", () => {
  const fund = readFileSync(join(import.meta.dirname, "../app/(fund)/page.tsx"), "utf8");
  const admin = readFileSync(
    join(import.meta.dirname, "../app/(admin)/admin/funds/[fundKey]/(fund-console)/page.tsx"),
    "utf8",
  );
  assert.match(fund, /FundOverviewView/);
  assert.match(admin, /FundOverviewView/);
  assert.doesNotMatch(fund, /getKpiSummary/);
  assert.doesNotMatch(admin, /getKpiSummary/);
});

test("the overview streams: every section sits behind its own Suspense boundary", () => {
  const view = readFileSync(join(import.meta.dirname, "../components/fund/overview.tsx"), "utf8");
  // Without boundaries the page shows nothing until the slowest read of the slowest section lands.
  assert.match(view, /import \{ Suspense \} from "react"/);
  for (const section of [
    "ActivitySection",
    "StatusSection",
    "RecentSection",
    "ActionsSection",
  ]) {
    const at = view.indexOf(`<${section} `);
    assert.notEqual(at, -1, `${section} must be rendered`);
    // The fallback prop holds its own JSX, so this reads back from the tag instead of matching
    // across it: what matters is that a boundary opens immediately before the section.
    const before = view.slice(Math.max(0, at - 200), at);
    assert.match(before, /<Suspense[\s\S]*$/, `${section} must sit behind a Suspense boundary`);
  }
});
