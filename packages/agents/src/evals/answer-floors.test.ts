import assert from "node:assert/strict";
import { test } from "node:test";

import { ANSWER_THRESHOLDS, answerFloorFailures } from "./answer-floors";
import type { AggregateScores } from "./judge";

/** A run that clears every absolute floor with headroom — the guard must record its baseline. */
function passingAggregate(): AggregateScores {
  return {
    hardHallucination: 1,
    faithfulness: 0.9,
    relevance: 0.9,
    citationCorrectness: 0.9,
    completeness: 0.85,
    refusalCalibration: 1,
    citationVerification: 1,
    orphanRate: 0,
    danglingMarkerRate: 0,
    overRefusalRate: 0,
    underRefusalRate: 0,
    caseCount: 31,
    unverifiedCitationCount: 0,
    danglingCaseCount: 0,
    underRefusalCount: 0,
  };
}

test("a healthy run clears every absolute floor", () => {
  assert.deepEqual(answerFloorFailures(passingAggregate()), []);
});

test("a run sitting exactly on each floor still passes (>= / <= boundaries)", () => {
  const onFloor: AggregateScores = {
    ...passingAggregate(),
    hardHallucination: ANSWER_THRESHOLDS.hardHallucination,
    faithfulness: ANSWER_THRESHOLDS.softFaithfulness,
    relevance: ANSWER_THRESHOLDS.relevance,
    citationCorrectness: ANSWER_THRESHOLDS.citationCorrectness,
    completeness: ANSWER_THRESHOLDS.completeness,
    refusalCalibration: ANSWER_THRESHOLDS.refusalCalibration,
    unverifiedCitationCount: ANSWER_THRESHOLDS.maxUnverifiedCount,
    orphanRate: ANSWER_THRESHOLDS.maxOrphanRate,
    danglingCaseCount: ANSWER_THRESHOLDS.maxDanglingCount,
    overRefusalRate: ANSWER_THRESHOLDS.maxOverRefusalRate,
    underRefusalCount: ANSWER_THRESHOLDS.maxUnderRefusalCount,
  };
  assert.deepEqual(answerFloorFailures(onFloor), []);
});

// The corrupt-baseline incident: a red run below the floors must be refused, one metric at a time.
const breaches: ReadonlyArray<{ label: string; patch: Partial<AggregateScores> }> = [
  { label: "hard-hallucination", patch: { hardHallucination: 0.9 } },
  { label: "soft-faithfulness", patch: { faithfulness: 0.7 } },
  { label: "relevance", patch: { relevance: 0.7 } },
  { label: "citation-correctness", patch: { citationCorrectness: 0.5 } },
  { label: "completeness", patch: { completeness: 0.5 } },
  { label: "refusal-calibration", patch: { refusalCalibration: 0.5 } },
  { label: "citation-verification (count)", patch: { unverifiedCitationCount: 2 } },
  { label: "orphan-source-rate", patch: { orphanRate: 0.1 } },
  { label: "dangling-marker (count)", patch: { danglingCaseCount: 2 } },
  { label: "over-refusal-rate", patch: { overRefusalRate: 0.5 } },
  { label: "under-refusal (count)", patch: { underRefusalCount: 2 } },
];

for (const { label, patch } of breaches) {
  test(`a run below the ${label} floor is flagged`, () => {
    const failures = answerFloorFailures({ ...passingAggregate(), ...patch });
    assert.ok(failures.includes(label), `expected ${label} in [${failures.join(", ")}]`);
    assert.equal(failures.length, 1, `only ${label} should fail, got [${failures.join(", ")}]`);
  });
}

test("a run failing multiple floors reports each of them", () => {
  const failures = answerFloorFailures({
    ...passingAggregate(),
    hardHallucination: 0.5,
    underRefusalCount: 3,
    orphanRate: 0.2,
  });
  assert.deepEqual(new Set(failures), new Set(["hard-hallucination", "orphan-source-rate", "under-refusal (count)"]));
});
