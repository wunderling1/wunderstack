import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { percentagesFromRatings } from "./roleplay-weights.js";

/**
 * Sum in integer hundredths. Adding 14.29 seven times in binary floating point yields
 * 99.99999999999999 even when every term is exactly right.
 */
const sum = (values: number[]): number =>
  values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;

describe("percentagesFromRatings", () => {
  it("turns 1-5 importance ratings into percentages", () => {
    assert.deepEqual(percentagesFromRatings([3, 1]), [75, 25]);
  });

  it("sums to exactly 100 for three equal ratings (33.33 × 3 = 99.99 otherwise)", () => {
    const weights = percentagesFromRatings([3, 3, 3]);
    assert.equal(sum(weights), 100);
    assert.deepEqual(weights, [33.33, 33.33, 33.34]);
  });

  it("sums to exactly 100 across awkward ratios", () => {
    for (const ratings of [[1, 1, 1, 1, 1, 1, 1], [5, 3, 3, 2, 1], [1, 2], [4, 4, 4, 4, 4, 4]]) {
      const weights = percentagesFromRatings(ratings);
      assert.equal(sum(weights), 100, `ratings ${ratings.join(",")} summed to ${String(sum(weights))}`);
    }
  });

  it("spreads weight equally when no rating is usable", () => {
    assert.deepEqual(percentagesFromRatings([0, Number.NaN, -2]), [33.33, 33.33, 33.34]);
  });

  it("returns nothing for an empty list instead of dividing by zero", () => {
    assert.deepEqual(percentagesFromRatings([]), []);
  });
});
