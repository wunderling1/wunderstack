import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  addCivilDays,
  capPulseTicks,
  civilDateInZone,
  fillDailySeries,
  FUND_DISPLAY_TIMEZONE,
  PULSE_TICK_CAP,
  zonedStartOfDay,
  type PulseTick,
} from "./activity-series";
import type { TurnOutcomeValue } from "@wunderstack/shared";

test("capPulseTicks keeps the newest 200 and flags overflow", () => {
  const ticks: PulseTick[] = Array.from({ length: PULSE_TICK_CAP + 1 }, (_, index) => ({
    occurredAt: new Date(Date.UTC(2026, 8, 1, 12, 0, index)),
    outcome: "answered" as TurnOutcomeValue,
  }));
  const capped = capPulseTicks(ticks);
  assert.equal(capped.ticks.length, PULSE_TICK_CAP);
  assert.equal(capped.truncated, true);
  // Overflow drops the oldest; keep ticks[1] … ticks[200].
  assert.equal(capped.ticks[0]?.occurredAt.toISOString(), ticks[1]?.occurredAt.toISOString());
  assert.equal(capped.ticks.at(-1)?.occurredAt.toISOString(), ticks.at(-1)?.occurredAt.toISOString());
});

test("capPulseTicks leaves a short list untouched", () => {
  const ticks: PulseTick[] = [
    { occurredAt: new Date("2026-09-01T12:00:00.000Z"), outcome: "answered" },
  ];
  assert.deepEqual(capPulseTicks(ticks), { ticks, truncated: false });
});

test("civil dates in Amsterdam match CET and CEST", () => {
  // CEST (UTC+2) on 1 September 2026: 14:51 local is 12:51Z, still 1 September.
  assert.equal(
    civilDateInZone(new Date("2026-09-01T12:51:00.000Z"), FUND_DISPLAY_TIMEZONE),
    "2026-09-01",
  );
  // Just before midnight CEST: 1 Sep 00:30 local = 31 Aug 22:30Z.
  assert.equal(
    civilDateInZone(new Date("2026-08-31T22:30:00.000Z"), FUND_DISPLAY_TIMEZONE),
    "2026-09-01",
  );
  // CET (UTC+1) in January.
  assert.equal(
    civilDateInZone(new Date("2026-01-15T00:30:00.000Z"), FUND_DISPLAY_TIMEZONE),
    "2026-01-15",
  );
});

test("zonedStartOfDay is midnight in the zone, including around DST", () => {
  assert.equal(
    zonedStartOfDay("2026-09-01", FUND_DISPLAY_TIMEZONE).toISOString(),
    "2026-08-31T22:00:00.000Z",
  );
  assert.equal(
    zonedStartOfDay("2026-01-15", FUND_DISPLAY_TIMEZONE).toISOString(),
    "2026-01-14T23:00:00.000Z",
  );
  // 29 March 2026 is the EU spring-forward; that civil day still has a midnight.
  assert.equal(
    civilDateInZone(zonedStartOfDay("2026-03-29", FUND_DISPLAY_TIMEZONE), FUND_DISPLAY_TIMEZONE),
    "2026-03-29",
  );
  assert.equal(
    civilDateInZone(
      new Date(zonedStartOfDay("2026-03-29", FUND_DISPLAY_TIMEZONE).getTime() - 1),
      FUND_DISPLAY_TIMEZONE,
    ),
    "2026-03-28",
  );
});

test("fillDailySeries inserts zeros so a weekend dip is a point, not a gap", () => {
  const since = zonedStartOfDay("2026-08-07", FUND_DISPLAY_TIMEZONE);
  const until = zonedStartOfDay("2026-08-11", FUND_DISPLAY_TIMEZONE);
  const filled = fillDailySeries({ since, until }, [
    { day: "2026-08-07", questions: 42 },
    { day: "2026-08-10", questions: 47 },
  ]);
  assert.deepEqual(
    filled.map((row) => [row.day, row.questions]),
    [
      ["2026-08-07", 42],
      ["2026-08-08", 0],
      ["2026-08-09", 0],
      ["2026-08-10", 47],
    ],
  );
});

test("fillDailySeries includes the until-day when until is mid-afternoon", () => {
  const since = new Date("2026-08-02T12:51:00.000Z");
  const until = new Date("2026-09-01T12:51:00.000Z");
  const filled = fillDailySeries({ since, until }, []);
  assert.equal(filled[0]?.day, "2026-08-02");
  assert.equal(filled.at(-1)?.day, "2026-09-01");
  assert.equal(filled.length, 31);
  assert.ok(filled.every((row) => row.questions === 0));
});

test("addCivilDays walks calendar dates, not 24-hour instants", () => {
  assert.equal(addCivilDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addCivilDays("2026-03-29", 1), "2026-03-30");
});

test("the daily-series SQL uses the same zone name the formatters use", () => {
  const source = readFileSync(new URL("./activity-series.ts", import.meta.url), "utf8");
  assert.equal(FUND_DISPLAY_TIMEZONE, "Europe/Amsterdam");
  assert.match(source, /at time zone \$\{sql\.raw\("'Europe\/Amsterdam'"\)\}/);
  assert.doesNotMatch(source, /toISOString\(\)\.slice\(0,\s*10\)/);
});
