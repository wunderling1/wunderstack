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

  // Sliced per block rather than counted, so an unrelated block does not move the number.
  for (const block of ["StatusBlock", "ActionsBlock"]) {
    const start = view.indexOf(`function ${block}(`);
    assert.notEqual(start, -1, `${block} must exist`);
    const body = view.slice(start, view.indexOf("\nfunction ", start + 1));
    assert.match(body, /MeasurementNote/, `${block} shows a rate, so it must show D6`);
  }
});

test("overview loader uses one parsed period for current and previous windows", () => {
  const source = readFileSync(join(import.meta.dirname, "./overview-load.ts"), "utf8");
  assert.match(source, /currentWindow\(period/);
  assert.match(source, /previousWindow\(current\)/);
  assert.match(source, /getOutcomeBreakdown\(\{ fundKey, \.\.\.window \}\)/);
  assert.match(source, /getOutcomeBreakdown\(\{ fundKey, \.\.\.prevWindow \}\)/);
  assert.doesNotMatch(source, /sinceDaysAgo\(30\)/);
});

test("overview pages do not query KPI SQL locally", () => {
  const fund = readFileSync(join(import.meta.dirname, "../app/(fund)/page.tsx"), "utf8");
  const admin = readFileSync(
    join(import.meta.dirname, "../app/(admin)/admin/funds/[fundKey]/(fund-console)/page.tsx"),
    "utf8",
  );
  assert.match(fund, /loadOverviewModel/);
  assert.match(admin, /loadOverviewModel/);
  assert.doesNotMatch(fund, /getKpiSummary/);
  assert.doesNotMatch(admin, /getKpiSummary/);
});
