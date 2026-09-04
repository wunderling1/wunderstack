import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractJsonObject,
  normalizeReviewOutput,
  roleplayReviewOutputSchema,
  toScore,
} from "./schemas";
import type { WeightedCriterion } from "./types";

const criteria: WeightedCriterion[] = [
  { question: "Vraagt de deelnemer door?", description: "", behavioralIndicators: [], weight: 60 },
  { question: "Vat de deelnemer samen?", description: "", behavioralIndicators: [], weight: 40 },
];

describe("extractJsonObject", () => {
  it("reads plain JSON", () => {
    assert.deepEqual(extractJsonObject('{"text":"hoi"}'), { text: "hoi" });
  });

  it("survives a fenced code block", () => {
    assert.deepEqual(extractJsonObject('```json\n{"text":"hoi"}\n```'), { text: "hoi" });
  });

  it("survives a chatty preamble and trailing apology", () => {
    const response = 'Natuurlijk! Hier is de JSON:\n{"text":"hoi"}\nLaat het weten als je meer wilt.';
    assert.deepEqual(extractJsonObject(response), { text: "hoi" });
  });

  it("keeps nested objects intact (slices to the LAST brace, not the first)", () => {
    const parsed = extractJsonObject('prefix {"a":{"b":1},"c":2} suffix') as Record<string, unknown>;
    assert.deepEqual(parsed, { a: { b: 1 }, c: 2 });
  });

  it("throws when there is no object at all", () => {
    assert.throws(() => extractJsonObject("Sorry, dat kan ik niet."), /no JSON object/);
  });

  it("throws when the braces contain something that is not JSON", () => {
    assert.throws(() => extractJsonObject("{niet echt json}"), /not valid JSON/);
  });
});

describe("toScore", () => {
  it("clamps out-of-range scores rather than rejecting the review", () => {
    assert.equal(toScore(11), 10);
    assert.equal(toScore(-3), 0);
  });

  it("rounds to one decimal", () => {
    assert.equal(toScore(7.44), 7.4);
    assert.equal(toScore(7.46), 7.5);
  });

  it("returns null — not zero — for anything non-numeric", () => {
    assert.equal(toScore(undefined), null);
    assert.equal(toScore(null), null);
    assert.equal(toScore("geen score"), null);
    assert.equal(toScore(Number.NaN), null);
    assert.equal(toScore(Number.POSITIVE_INFINITY), null);
  });

  it("accepts a numeric string, which models emit often enough to matter", () => {
    assert.equal(toScore("7.5"), 7.5);
  });
});

describe("normalizeReviewOutput", () => {
  it("keeps the authored wording even when the model paraphrases the question", () => {
    const result = normalizeReviewOutput(
      roleplayReviewOutputSchema.parse({
        feedback: [
          { question: "Doorvragen?", answer: "Goed gedaan", score: 8 },
          { question: "Samenvatten?", answer: "Matig", score: 4 },
        ],
        feedbackSummary: "…",
        isPassed: true,
      }),
      criteria,
    );
    assert.deepEqual(
      result.map((item) => item.question),
      ["Vraagt de deelnemer door?", "Vat de deelnemer samen?"],
    );
  });

  it("always returns exactly one entry per criterion, in rubric order", () => {
    const result = normalizeReviewOutput(
      roleplayReviewOutputSchema.parse({
        feedback: [{ question: "Vraagt de deelnemer door?", answer: "Goed", score: 8 }],
        feedbackSummary: "…",
        isPassed: true,
      }),
      criteria,
    );
    assert.equal(result.length, 2);
    assert.equal(result[1]?.feedback, "");
    assert.equal(result[1]?.score, null);
  });

  it("recovers a reordered review by matching the question text", () => {
    const result = normalizeReviewOutput(
      roleplayReviewOutputSchema.parse({
        feedback: [
          { question: "vat de deelnemer samen?", answer: "Samenvatting ontbrak", score: 3 },
          { question: "vraagt de deelnemer door?", answer: "Sterk doorgevraagd", score: 9 },
        ],
        feedbackSummary: "…",
        isPassed: false,
      }),
      criteria,
    );
    // Position wins for the answer, so index 0 keeps its text but is relabelled to criterion 0.
    // The score for criterion 0 comes from the same positional item.
    assert.equal(result[0]?.question, "Vraagt de deelnemer door?");
    assert.equal(result[0]?.score, 3);
  });

  it("falls back to the question match when the positional answer is blank", () => {
    const result = normalizeReviewOutput(
      roleplayReviewOutputSchema.parse({
        feedback: [
          { question: "onzin", answer: "   " },
          { question: "Vraagt de deelnemer door?", answer: "De echte feedback", score: 7 },
        ],
        feedbackSummary: "…",
        isPassed: true,
      }),
      criteria,
    );
    assert.equal(result[0]?.feedback, "De echte feedback");
    assert.equal(result[0]?.score, 7);
  });

  it("takes a missing per-item score from the separate scores array", () => {
    const result = normalizeReviewOutput(
      roleplayReviewOutputSchema.parse({
        feedback: [
          { question: "Vraagt de deelnemer door?", answer: "Goed" },
          { question: "Vat de deelnemer samen?", answer: "Matig" },
        ],
        feedbackSummary: "…",
        isPassed: true,
        scores: [
          { criterion: "Vat de deelnemer samen?", score: 4 },
          { criterion: "Vraagt de deelnemer door?", score: 8 },
        ],
      }),
      criteria,
    );
    assert.equal(result[0]?.score, 8);
    assert.equal(result[1]?.score, 4);
  });

  it("carries the criterion weight so the total can be re-derived from the stored row", () => {
    const result = normalizeReviewOutput(
      roleplayReviewOutputSchema.parse({
        feedback: [{ question: "a", answer: "b", score: 5 }],
        feedbackSummary: "…",
        isPassed: true,
      }),
      criteria,
    );
    assert.deepEqual(
      result.map((item) => item.weight),
      [60, 40],
    );
  });

  it("clamps an out-of-range score instead of discarding the whole review", () => {
    const result = normalizeReviewOutput(
      roleplayReviewOutputSchema.parse({
        feedback: [
          { question: "Vraagt de deelnemer door?", answer: "Uitmuntend", score: 12 },
          { question: "Vat de deelnemer samen?", answer: "Slecht", score: -1 },
        ],
        feedbackSummary: "…",
        isPassed: true,
      }),
      criteria,
    );
    assert.equal(result[0]?.score, 10);
    assert.equal(result[1]?.score, 0);
  });
});
