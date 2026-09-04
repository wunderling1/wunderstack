import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ANSWER_THRESHOLDS } from "./answer-floors";
import {
  ANSWER_CHECK_KIND,
  contentGatesBlocking,
  isAdvisory,
  isPathScopeNone,
  parsePathScopeIds,
  PATH_SCOPE_NONE,
  pathScopeAllowed,
  resolveTier,
  ROLEPLAY_CHECK_KIND,
} from "./content-policy";
import { ROLEPLAY_THRESHOLDS } from "./roleplay-floors";

/** Grounded mechanism thresholds — hardcoded so a silent reclassification fails this test. */
const GROUNDED_MECHANISM = [
  "hardHallucination",
  "maxOrphanRate",
  "maxUnverifiedCount",
  "maxDanglingCount",
  "maxUnderRefusalCount",
  "maxOverRefusalRate",
  "refusalCalibration",
] as const;

/** Roleplay mechanism thresholds — eight [X] plus the named [C]-but-blocking exception. */
const ROLEPLAY_MECHANISM = [
  "maxGenerationFailureCount",
  "maxPersonaBreakCount",
  "maxEarlyRevealCount",
  "maxPrematureEndCount",
  "maxMissingReviewCount",
  "maxPassFlipCount",
  "maxShapeFailureCount",
  "maxOrderingViolations",
  "maxEndFlagMismatchCount",
] as const;

describe("ANSWER_CHECK_KIND", () => {
  it("covers every ANSWER_THRESHOLDS key exactly once", () => {
    assert.deepEqual(
      Object.keys(ANSWER_CHECK_KIND).sort(),
      Object.keys(ANSWER_THRESHOLDS).sort(),
    );
  });

  it("classifies the seven grounded mechanism thresholds", () => {
    for (const key of GROUNDED_MECHANISM) {
      assert.equal(ANSWER_CHECK_KIND[key], "mechanism", key);
    }
  });

  it("classifies softFaithfulness, relevance, completeness, citationCorrectness as content", () => {
    assert.equal(ANSWER_CHECK_KIND.softFaithfulness, "content");
    assert.equal(ANSWER_CHECK_KIND.relevance, "content");
    assert.equal(ANSWER_CHECK_KIND.completeness, "content");
    assert.equal(ANSWER_CHECK_KIND.citationCorrectness, "content");
  });
});

describe("ROLEPLAY_CHECK_KIND", () => {
  it("covers every ROLEPLAY_THRESHOLDS key exactly once", () => {
    assert.deepEqual(
      Object.keys(ROLEPLAY_CHECK_KIND).sort(),
      Object.keys(ROLEPLAY_THRESHOLDS).sort(),
    );
  });

  it("classifies the nine roleplay mechanism thresholds", () => {
    for (const key of ROLEPLAY_MECHANISM) {
      assert.equal(ROLEPLAY_CHECK_KIND[key], "mechanism", key);
    }
  });

  it("[C] maar blokkerend: mismatch bereikt het LMS van de leerling", () => {
    assert.equal(ROLEPLAY_CHECK_KIND.maxEndFlagMismatchCount, "mechanism");
  });

  it("classifies minInRoleScore and maxScoreSpread as content", () => {
    assert.equal(ROLEPLAY_CHECK_KIND.minInRoleScore, "content");
    assert.equal(ROLEPLAY_CHECK_KIND.maxScoreSpread, "content");
  });
});

describe("resolveTier / contentGatesBlocking / pathScopeAllowed", () => {
  it("defaults unknown and missing to nightly", () => {
    assert.equal(resolveTier(undefined), "nightly");
    assert.equal(resolveTier("onzin"), "nightly");
  });

  it("accepts pr, merge, nightly", () => {
    assert.equal(resolveTier("pr"), "pr");
    assert.equal(resolveTier("merge"), "merge");
    assert.equal(resolveTier("nightly"), "nightly");
  });

  it("content gates block on merge and nightly, not on pr", () => {
    assert.equal(contentGatesBlocking("merge"), true);
    assert.equal(contentGatesBlocking("nightly"), true);
    assert.equal(contentGatesBlocking("pr"), false);
  });

  it("path scope is only allowed on the PR tier", () => {
    assert.equal(pathScopeAllowed("pr"), true);
    assert.equal(pathScopeAllowed("merge"), false);
    assert.equal(pathScopeAllowed("nightly"), false);
  });

  it("isAdvisory only for content on the PR tier", () => {
    assert.equal(isAdvisory("content", "pr"), true);
    assert.equal(isAdvisory("content", "merge"), false);
    assert.equal(isAdvisory("mechanism", "pr"), false);
  });
});

describe("parsePathScopeIds / isPathScopeNone", () => {
  it("empty or unset means full registry (not the none sentinel)", () => {
    assert.deepEqual(parsePathScopeIds(undefined), []);
    assert.deepEqual(parsePathScopeIds(""), []);
    assert.equal(isPathScopeNone([]), false);
  });

  it("parses the none sentinel as a single-token scope", () => {
    assert.deepEqual(parsePathScopeIds(PATH_SCOPE_NONE), [PATH_SCOPE_NONE]);
    assert.equal(isPathScopeNone([PATH_SCOPE_NONE]), true);
  });

  it("parses a comma-separated gate id list", () => {
    assert.deepEqual(parsePathScopeIds("G2-answer, G2-retrieval"), ["G2-answer", "G2-retrieval"]);
    assert.equal(isPathScopeNone(["G2-answer"]), false);
  });
});
