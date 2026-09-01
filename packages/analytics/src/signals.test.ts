import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  frequencyRecencyScore,
  groupsAtOccurrenceThreshold,
  includeExerciseAdoption,
  mapQuestionSignal,
  SIGNAL_MIN_OCCURRENCES,
  sortByFrequencyRecency,
} from "./signals.js";

const SOURCE = readFileSync(new URL("./signals.ts", import.meta.url), "utf8");

test("S18: occurrence threshold is a HAVING in the query, not a UI filter", () => {
  const havingIndex = SOURCE.indexOf(".having(sql`count(*) >= ${SIGNAL_MIN_OCCURRENCES}`)");
  assert.notEqual(havingIndex, -1);
  const line = SOURCE.slice(0, havingIndex).split("\n").length;
  assert.equal(SOURCE.includes("SIGNAL_MIN_OCCURRENCES"), true);
  assert.equal(SIGNAL_MIN_OCCURRENCES, 3);
  // Documented location for the DoD: packages/analytics/src/signals.ts
  assert.ok(line > 1, `HAVING must live in signals.ts (line ${line})`);
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
  assert.doesNotMatch(SOURCE, /openai|summariz|cluster|generateTheme|themeLabel/i);
  assert.match(SOURCE, /eq\(interactionEvents\.theme, query\.theme\)/);
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
  assert.match(SOURCE, /roleplaySessions/);
  assert.match(SOURCE, /loadQuestionSignals/);
  assert.notEqual(SOURCE.indexOf("loadExerciseAdoption"), SOURCE.indexOf("loadQuestionSignals"));
});

test("strength none is retrieved_count = 0; strong is retrieved_count > 0 and top_score >= floor", () => {
  assert.match(SOURCE, /eq\(interactionEvents\.retrievedCount, 0\)/);
  assert.match(SOURCE, /gt\(interactionEvents\.retrievedCount, 0\)/);
  assert.match(SOURCE, /gte\(interactionEvents\.topScore, RETRIEVAL_STRONG_MIN_SCORE\)/);
});
