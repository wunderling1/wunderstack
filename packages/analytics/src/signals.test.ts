import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  frequencyRecencyScore,
  groupsAtOccurrenceThreshold,
  includeExerciseAdoption,
  mapQuestionSignal,
  questionSignalsFrom,
  SIGNAL_LIST_LIMIT,
  SIGNAL_MIN_OCCURRENCES,
  sortByFrequencyRecency,
} from "./signals";

const SOURCE = readFileSync(new URL("./signals.ts", import.meta.url), "utf8");

// S18 (the threshold sits in the query, and narrowing cannot ungroup) is asserted against a real
// schema in fund-environment.integration.test.ts. What follows tests the pure grouping helpers.
test("S18: the threshold value the query and the UI copy share", () => {
  assert.equal(SIGNAL_MIN_OCCURRENCES, 3);
});

test("S18: narrowing below the threshold yields empty groups, not loose event rows", () => {
  const unfiltered = [
    {
      question: "Hoeveel vakantiedagen?",
      occurrenceCount: 4,
      latestEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  ];
  assert.equal(groupsAtOccurrenceThreshold(unfiltered).length, 1);

  // Same question after agent + 7d + theme: only 2 copies remain — below the HAVING.
  const narrowed = [
    {
      question: "Hoeveel vakantiedagen?",
      occurrenceCount: SIGNAL_MIN_OCCURRENCES - 1,
      latestEventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  ];
  const shown = groupsAtOccurrenceThreshold(narrowed);
  assert.deepEqual(shown, []);
  // Forbidden: ungroup into occurrenceCount individual rows.
  assert.notEqual(shown.length, narrowed[0]?.occurrenceCount);
});

test("mapped rows keep the literal question — no generated theme or summary", () => {
  const row = mapQuestionSignal({
    question: "Hoeveel vakantiedagen heb ik?",
    occurrenceCount: 5,
    lastOccurredAt: new Date("2026-09-01T10:00:00.000Z"),
    latestEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  assert.equal(row?.question, "Hoeveel vakantiedagen heb ik?");
  assert.equal(row?.latestEventId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  // Not a behaviour claim but a guard on this file: no summariser may be introduced here later.
  assert.doesNotMatch(SOURCE, /openai|summariz|cluster|generateTheme|themeLabel/i);
});

test("frequency × recency ranks a recent group above a stale larger group", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");
  const recent = frequencyRecencyScore(3, new Date("2026-08-31T12:00:00.000Z"), now);
  const stale = frequencyRecencyScore(10, new Date("2026-06-01T12:00:00.000Z"), now);
  assert.ok(recent > stale);

  const sorted = sortByFrequencyRecency(
    [
      {
        question: "stale",
        occurrenceCount: 10,
        lastOccurredAt: new Date("2026-06-01T12:00:00.000Z"),
      },
      {
        question: "recent",
        occurrenceCount: 3,
        lastOccurredAt: new Date("2026-08-31T12:00:00.000Z"),
      },
    ],
    now,
  );
  assert.equal(sorted[0]?.question, "recent");
});

test("exercise adoption is outside the knowledge-gap query and drops on a grounded agent filter", () => {
  assert.equal(includeExerciseAdoption({ fundKey: "demo", since: new Date() }), true);
  assert.equal(
    includeExerciseAdoption({ fundKey: "demo", since: new Date(), agentId: "roleplay" }),
    true,
  );
  assert.equal(
    includeExerciseAdoption({ fundKey: "demo", since: new Date(), agentId: "cao" }),
    false,
  );
});

test("knowledge gap total is uncapped while the list stops at SIGNAL_LIST_LIMIT", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");
  const rows = Array.from({ length: 51 }, (_, index) => ({
    question: `Vraag ${index}`,
    occurrenceCount: SIGNAL_MIN_OCCURRENCES,
    lastOccurredAt: now,
    latestEventId: `${String(index).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  }));
  const all = questionSignalsFrom(rows, now);
  const listed = all.slice(0, SIGNAL_LIST_LIMIT);
  assert.equal(all.length, 51);
  assert.equal(listed.length, 50);
});
