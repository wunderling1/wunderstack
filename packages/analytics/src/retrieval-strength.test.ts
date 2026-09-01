import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RETRIEVAL_STRONG_MIN_SCORE,
  deriveRetrievalStrength,
} from "./retrieval-strength.js";
import { strengthFromSignals } from "./outcomes.js";

describe("deriveRetrievalStrength", () => {
  it("returns none when nothing was retrieved", () => {
    assert.equal(deriveRetrievalStrength(0, null), "none");
    assert.equal(deriveRetrievalStrength(0, 0.9), "none");
  });

  it("returns weak when hits exist but top score is below the platform threshold", () => {
    assert.equal(deriveRetrievalStrength(3, 0.5), "weak");
    assert.equal(deriveRetrievalStrength(1, null), "weak");
    assert.equal(deriveRetrievalStrength(2, RETRIEVAL_STRONG_MIN_SCORE - 0.01), "weak");
  });

  it("returns strong at or above RETRIEVAL_STRONG_MIN_SCORE", () => {
    assert.equal(deriveRetrievalStrength(2, RETRIEVAL_STRONG_MIN_SCORE), "strong");
    assert.equal(deriveRetrievalStrength(1, 0.95), "strong");
  });
});

describe("strengthFromSignals matches deriveRetrievalStrength on the 0.6 boundary", () => {
  it("treats exactly 0.6 as strong", () => {
    assert.equal(deriveRetrievalStrength(1, RETRIEVAL_STRONG_MIN_SCORE), "strong");
    assert.equal(strengthFromSignals(1, RETRIEVAL_STRONG_MIN_SCORE, true), "strong");
  });

  it("treats just below 0.6 as weak", () => {
    const below = RETRIEVAL_STRONG_MIN_SCORE - 0.0001;
    assert.equal(deriveRetrievalStrength(1, below), "weak");
    assert.equal(strengthFromSignals(1, below, true), "weak");
  });
});
