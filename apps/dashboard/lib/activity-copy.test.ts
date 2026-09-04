import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activityConversationsHref,
  comparisonLine,
  formatDayPointLabel,
  formatPeriodThrough,
  formatRelativeToNow,
  questionGrowth,
} from "./activity-copy";

test("questionGrowth never prints infinity or +0%", () => {
  assert.deepEqual(questionGrowth(1284, 1088), { kind: "delta", label: "+18%" });
  assert.deepEqual(questionGrowth(100, 104), { kind: "delta", label: "−4%" });
  assert.deepEqual(questionGrowth(50, 0), { kind: "first" });
  assert.deepEqual(questionGrowth(0, 0), { kind: "equal" });
  assert.deepEqual(questionGrowth(100, 100), { kind: "equal" });
  assert.deepEqual(questionGrowth(100, 99), { kind: "delta", label: "+1%" });
});

test("comparisonLine matches the Activiteit copy rules", () => {
  const count = (n: number) => n.toLocaleString("nl-NL");
  assert.equal(comparisonLine(1284, 1088, count), "Vorige periode 1.088 — +18%");
  assert.equal(comparisonLine(12, 0, count), "Eerste periode met vragen");
  assert.equal(comparisonLine(100, 100, count), "Vorige periode 100 — gelijk");
});

test("formatPeriodThrough uses the picker label plus t/m the until-day", () => {
  assert.equal(
    formatPeriodThrough("30d", new Date("2026-09-01T12:51:00.000Z")),
    "30 dagen t/m 1 september",
  );
  assert.equal(
    formatPeriodThrough("7d", new Date("2026-09-01T12:51:00.000Z")),
    "7 dagen t/m 1 september",
  );
});

test("formatRelativeToNow is relative under a day, then gisteren, then a date", () => {
  const now = new Date("2026-09-01T12:51:00.000Z");
  assert.equal(formatRelativeToNow(new Date("2026-09-01T12:47:00.000Z"), now), "4 minuten geleden");
  assert.equal(formatRelativeToNow(new Date("2026-09-01T09:51:00.000Z"), now), "3 uur geleden");
  assert.equal(formatRelativeToNow(new Date("2026-08-31T14:20:00.000Z"), now), "gisteren 16:20");
  assert.match(formatRelativeToNow(new Date("2026-08-28T07:14:00.000Z"), now), /28 aug/);
});

test("formatDayPointLabel is the sparkline hover, one day, one count", () => {
  assert.match(formatDayPointLabel({ day: "2026-08-19", questions: 66 }), /19 aug/);
  assert.match(formatDayPointLabel({ day: "2026-08-19", questions: 66 }), /66 vragen/);
  assert.match(formatDayPointLabel({ day: "2026-08-19", questions: 1 }), /1 vraag$/);
});

test("activityConversationsHref is one destination per number (S11a)", () => {
  assert.equal(activityConversationsHref("/conversations", "30d"), "/conversations?period=30d");
  assert.equal(
    activityConversationsHref("/conversations", "30d", true),
    "/conversations?period=30d&since=today",
  );
  assert.equal(
    activityConversationsHref("/admin/funds/oomt/conversations", "7d", true),
    "/admin/funds/oomt/conversations?period=7d&since=today",
  );
});
