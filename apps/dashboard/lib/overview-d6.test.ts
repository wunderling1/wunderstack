import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("overview splits show measurementStartedAt (D6)", () => {
  const view = readFileSync(
    join(import.meta.dirname, "../components/fund/overview.tsx"),
    "utf8",
  );
  assert.match(view, /MeasurementNote/);
  assert.equal((view.match(/MeasurementNote/g) ?? []).length, 3);
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
