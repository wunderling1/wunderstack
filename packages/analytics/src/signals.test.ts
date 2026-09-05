import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  corpusHintFromGroup,
  includeExerciseAdoption,
  mapQuestionSignal,
  normalizeQuestionKey,
  questionSignalsFrom,
  SIGNAL_LIST_LIMIT,
  sortByFrequencyThenRecency,
} from "./signals";

const SOURCE = readFileSync(new URL("./signals.ts", import.meta.url), "utf8");

test("near-literal normalisation collapses case, punctuation and whitespace", () => {
  assert.equal(
    normalizeQuestionKey("Hoeveel vakantiedagen heb ik?"),
    normalizeQuestionKey("hoeveel  vakantiedagen heb ik"),
  );
  assert.notEqual(
    normalizeQuestionKey("Hoeveel vakantiedagen heb ik?"),
    normalizeQuestionKey("Hoeveel ziektedagen heb ik?"),
  );
});

test("mapped rows keep the literal question — no generated theme or summary", () => {
  const row = mapQuestionSignal({
    question: "Hoeveel vakantiedagen heb ik?",
    occurrenceCount: 5,
    distinctActors: 4,
    agentKey: "cao",
    noneCount: 5,
    lastOccurredAt: new Date("2026-09-01T10:00:00.000Z"),
    latestEventId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });
  assert.equal(row?.question, "Hoeveel vakantiedagen heb ik?");
  assert.equal(row?.latestEventId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  assert.equal(row?.agentKey, "cao");
  assert.equal(row?.distinctActors, 4);
  assert.equal(row?.corpusHint, "none");
  assert.doesNotMatch(SOURCE, /openai|summariz|cluster|generateTheme|themeLabel/i);
});

test("corpus hint is none only when every turn had zero hits", () => {
  assert.equal(corpusHintFromGroup(5, 5), "none");
  assert.equal(corpusHintFromGroup(3, 5), "thin");
  assert.equal(corpusHintFromGroup(0, 5), "thin");
});

test("frequency then recency ranks a larger group above a smaller recent one", () => {
  const sorted = sortByFrequencyThenRecency([
    {
      question: "recent-small",
      occurrenceCount: 3,
      lastOccurredAt: new Date("2026-08-31T12:00:00.000Z"),
    },
    {
      question: "stale-large",
      occurrenceCount: 10,
      lastOccurredAt: new Date("2026-06-01T12:00:00.000Z"),
    },
  ]);
  assert.equal(sorted[0]?.question, "stale-large");
  assert.equal(sorted[1]?.question, "recent-small");
});

test("equal frequency breaks ties on recency", () => {
  const sorted = sortByFrequencyThenRecency([
    {
      question: "older",
      occurrenceCount: 5,
      lastOccurredAt: new Date("2026-08-01T12:00:00.000Z"),
    },
    {
      question: "newer",
      occurrenceCount: 5,
      lastOccurredAt: new Date("2026-08-31T12:00:00.000Z"),
    },
  ]);
  assert.equal(sorted[0]?.question, "newer");
});

test("exercise adoption is outside the knowledge-gap query and drops on a grounded agent filter", () => {
  assert.equal(includeExerciseAdoption({ fundKey: "demo", since: new Date() }), true);
  assert.equal(
    includeExerciseAdoption({ fundKey: "demo", since: new Date(), agentKey: "roleplay" }),
    true,
  );
  assert.equal(
    includeExerciseAdoption({ fundKey: "demo", since: new Date(), agentKey: "cao" }),
    false,
  );
});

test("knowledge gap list pages at SIGNAL_LIST_LIMIT while the uncapped group set stays intact", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");
  const rows = Array.from({ length: 51 }, (_, index) => ({
    question: `Vraag ${index}`,
    occurrenceCount: 1,
    distinctActors: 1,
    agentKey: "cao",
    noneCount: 1,
    lastOccurredAt: now,
    latestEventId: `${String(index).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  }));
  const all = questionSignalsFrom(rows);
  const listed = all.slice(0, SIGNAL_LIST_LIMIT);
  assert.equal(all.length, 51);
  assert.equal(listed.length, 50);
});

test("listSignals pages groups in SQL (D10) — not by slicing a full ranking in JS", () => {
  assert.match(SOURCE, /\.limit\(bounds\.limit\)/);
  assert.match(SOURCE, /\.offset\(bounds\.offset\)/);
  assert.match(SOURCE, /loadQuestionGroupCount/);
  assert.match(SOURCE, /limit: SIGNAL_LIST_LIMIT,\s*\n\s*offset,/);
  assert.match(SOURCE, /limit: 3/);
  assert.doesNotMatch(SOURCE, /ranked\.slice\(offset/);
  assert.doesNotMatch(SOURCE, /knowledgeGapsGroupTotal: ranked\.length/);
});

test("knowledge-gap WHERE follows A3' — typed coverage vs rest vs guards", () => {
  assert.match(SOURCE, /out_of_domain/);
  assert.match(SOURCE, /out_of_scope/);
  assert.match(SOURCE, /partial_evidence/);
  assert.match(SOURCE, /no_coverage/);
  assert.match(SOURCE, /guard_hard_fact/);
  assert.match(SOURCE, /guard_citation_coupling/);
  assert.match(SOURCE, /isTypedCoverageReason/);
  assert.match(SOURCE, /isGuardReason/);
  assert.match(SOURCE, /isNoCoverageReason/);
  assert.doesNotMatch(SOURCE, /theme\?:/);
  assert.doesNotMatch(SOURCE, /SIGNAL_MIN_OCCURRENCES/);
  // Gap is no longer the negation of strong retrieval: typed coverage with strong
  // retrieval stays on the fund list.
  assert.doesNotMatch(SOURCE, /if \(strength === "gap"\) \{\s*return not\(isStrongRetrieval\(\)\)/);
});
