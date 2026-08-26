import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RubricCriterion } from "@wunderstack/shared";

import { computeWeightedScore, didPass, normalizeRubricWeights } from "./rubric.js";
import type { ScoredCriterion } from "./types.js";

function criterion(question: string, weight: number): RubricCriterion {
  return { question, description: "", behavioralIndicators: [], weight };
}

function scored(weight: number, score: number | null): ScoredCriterion {
  return { question: `q${String(weight)}`, feedback: "", score, weight };
}

/**
 * Sum in integer hundredths. Adding 14.29 seven times in binary floating point yields
 * 99.99999999999999 even when every term is exactly right, so a naive sum would test the IEEE-754
 * spec rather than the weighting.
 */
const sum = (values: number[]): number =>
  values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;

describe("normalizeRubricWeights", () => {
  it("turns 1-5 importance ratings into percentages", () => {
    const weights = normalizeRubricWeights([criterion("a", 3), criterion("b", 1)]).map(
      (item) => item.weight,
    );
    assert.deepEqual(weights, [75, 25]);
  });

  it("sums to exactly 100 for three equal criteria (33.33 × 3 = 99.99 otherwise)", () => {
    const weights = normalizeRubricWeights([
      criterion("a", 3),
      criterion("b", 3),
      criterion("c", 3),
    ]).map((item) => item.weight);
    assert.equal(sum(weights), 100);
    assert.deepEqual(weights, [33.33, 33.33, 33.34]);
  });

  it("sums to exactly 100 across awkward ratios", () => {
    for (const ratings of [[1, 1, 1, 1, 1, 1, 1], [5, 3, 3, 2, 1], [1, 2], [4, 4, 4, 4, 4, 4]]) {
      const weights = normalizeRubricWeights(
        ratings.map((rating, index) => criterion(`q${String(index)}`, rating)),
      ).map((item) => item.weight);
      assert.equal(sum(weights), 100, `ratings ${ratings.join(",")} summed to ${String(sum(weights))}`);
    }
  });

  it("spreads weight equally when no rating is usable, rather than scoring everything zero", () => {
    const weights = normalizeRubricWeights([
      criterion("a", 0),
      criterion("b", Number.NaN),
      criterion("c", -2),
    ]).map((item) => item.weight);
    assert.equal(sum(weights), 100);
    assert.deepEqual(weights, [33.33, 33.33, 33.34]);
  });

  it("carries description and behavioural indicators through untouched", () => {
    const [first] = normalizeRubricWeights([
      { question: "a", description: "toelichting", behavioralIndicators: ["x", "y"], weight: 1 },
    ]);
    assert.equal(first?.description, "toelichting");
    assert.deepEqual(first?.behavioralIndicators, ["x", "y"]);
  });

  it("returns nothing for an empty rubric instead of dividing by zero", () => {
    assert.deepEqual(normalizeRubricWeights([]), []);
  });
});

describe("computeWeightedScore", () => {
  it("weights each criterion by its share", () => {
    // 8 × 0.75 + 4 × 0.25 = 7
    assert.equal(computeWeightedScore([scored(75, 8), scored(25, 4)]), 7);
  });

  it("rounds to one decimal", () => {
    assert.equal(computeWeightedScore([scored(33.33, 7), scored(33.33, 8), scored(33.34, 6)]), 7);
    assert.equal(computeWeightedScore([scored(50, 7), scored(50, 8.5)]), 7.8);
  });

  it("re-normalises around an unscored criterion instead of counting it as zero", () => {
    // Only the 75%-criterion was scored; the result is that score, not 8 × 0.75 = 6.
    assert.equal(computeWeightedScore([scored(75, 8), scored(25, null)]), 8);
  });

  it("returns 0 when nothing was scored at all", () => {
    assert.equal(computeWeightedScore([scored(50, null), scored(50, null)]), 0);
    assert.equal(computeWeightedScore([]), 0);
  });

  it("falls back to a plain mean when every weight is zero", () => {
    assert.equal(computeWeightedScore([scored(0, 6), scored(0, 8)]), 7);
  });
});

describe("didPass", () => {
  it("passes exactly at the threshold", () => {
    assert.equal(didPass(5.5, 5.5), true);
    assert.equal(didPass(5.4, 5.5), false);
    assert.equal(didPass(10, 5.5), true);
  });
});
