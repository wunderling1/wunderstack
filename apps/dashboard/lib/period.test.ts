import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentWindow,
  parsePeriod,
  periodDays,
  periodHref,
  previousWindow,
} from "./period";

test("parsePeriod defaults to 30d and accepts 7d/90d", () => {
  assert.equal(parsePeriod(undefined), "30d");
  assert.equal(parsePeriod("7d"), "7d");
  assert.equal(parsePeriod(["90d"]), "90d");
  assert.equal(parsePeriod("nope"), "30d");
});

test("current and previous windows share one duration and do not overlap", () => {
  const now = new Date("2026-09-01T10:00:00.000Z");
  const current = currentWindow("30d", now);
  const previous = previousWindow(current);

  assert.equal(periodDays("30d"), 30);
  assert.equal(current.until.toISOString(), now.toISOString());
  assert.equal(previous.until.toISOString(), current.since.toISOString());
  assert.equal(
    current.until.getTime() - current.since.getTime(),
    previous.until.getTime() - previous.since.getTime(),
  );
  assert.ok(previous.until.getTime() <= current.since.getTime());
});

test("periodHref keeps the page path so every block uses the same searchparam", () => {
  assert.equal(periodHref("/admin/funds/oomt", "7d"), "/admin/funds/oomt?period=7d");
  assert.equal(periodHref("/", "90d"), "/?period=90d");
  assert.equal(
    periodHref("/conversations", "7d", { agent: "cao", reason: "no_coverage" }),
    "/conversations?period=7d&agent=cao&reason=no_coverage",
  );
});
