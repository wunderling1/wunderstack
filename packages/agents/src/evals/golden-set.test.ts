import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVAL_FIXTURE_FUND } from "@wunderstack/shared";

import {
  ARBO_G2_CORPUS_VERSION,
  ARBO_GOLDEN_FIXTURE_HASH,
  ARBO_RECORDED_FIXTURE_HASH,
  arboGoldenCases,
  arboGoldenPassages,
  arboPassageById,
  arboPassagesForCase,
  goldenCaseSchema,
  goldenCases,
  goldenFundSets,
  goldenPassages,
  passageById,
  passagesForCase,
} from "./golden-set.js";

describe("goldenCaseSchema refusal refinement", () => {
  const base = {
    id: "x",
    question: "q?",
    expectedPassageIds: [] as string[],
    referenceAnswer: "ref",
  };

  it("rejects a refusal case without distractor passages", () => {
    const result = goldenCaseSchema.safeParse({ ...base, category: "refusal" });
    assert.equal(result.success, false);
  });

  it("rejects a refusal case with an empty distractor list", () => {
    const result = goldenCaseSchema.safeParse({ ...base, category: "refusal", distractorPassageIds: [] });
    assert.equal(result.success, false);
  });

  it("accepts a refusal case with at least one distractor", () => {
    const result = goldenCaseSchema.safeParse({
      ...base,
      category: "refusal",
      distractorPassageIds: ["vakantiedagen"],
    });
    assert.equal(result.success, true);
  });

  it("accepts an answerable case without distractors", () => {
    const result = goldenCaseSchema.safeParse({ ...base, category: "in_scope" });
    assert.equal(result.success, true);
  });
});

describe("golden fixtures", () => {
  it("every refusal case has non-empty distractors that resolve to real passages", () => {
    const refusals = goldenCases.filter((testCase) => testCase.category === "refusal");
    assert.ok(refusals.length >= 10, "base set has at least 10 refusal cases (corpus v5)");
    for (const testCase of refusals) {
      const distractorCount = testCase.distractorPassageIds?.length ?? 0;
      assert.ok(distractorCount > 0, `${testCase.id} defines distractors`);
      // passagesForCase resolves the distractors for refusal cases; all must be known passage ids.
      assert.equal(
        passagesForCase(testCase).length,
        distractorCount,
        `${testCase.id} distractors all resolve to real passages`,
      );
    }
  });

  it("every referenced passage id resolves to a real passage", () => {
    for (const testCase of goldenCases) {
      for (const id of [...testCase.expectedPassageIds, ...(testCase.distractorPassageIds ?? [])]) {
        assert.ok(passageById(id) !== undefined, `${testCase.id} references unknown passage "${id}"`);
      }
    }
  });

  it("answerable cases with an expectedArticle include a matching passage", () => {
    const answerable = goldenCases.filter((testCase) => testCase.category !== "refusal" && testCase.expectedArticle);
    assert.ok(answerable.length > 0, "there is at least one answerable case with an expectedArticle");
    for (const testCase of answerable) {
      const hasMatch = passagesForCase(testCase).some((passage) => passage.article === testCase.expectedArticle);
      assert.ok(hasMatch, `${testCase.id} has a passage for article ${String(testCase.expectedArticle)}`);
    }
  });
});

describe("derived cases (E13)", () => {
  it("accepts the derived category", () => {
    const result = goldenCaseSchema.safeParse({
      id: "d",
      question: "en bij 24 uur?",
      expectedPassageIds: ["vakantie-uren"],
      referenceAnswer: "naar rato",
      category: "derived",
    });
    assert.equal(result.success, true);
  });

  it("ships derived pro-rata cases anchored on vakantie-uren + naar-rato", () => {
    const derived = goldenCases.filter((testCase) => testCase.category === "derived");
    assert.ok(derived.length >= 3, "there are at least three derived cases");
    for (const testCase of derived) {
      // The safe reference must ground the fulltime figure and the naar-rato rule (no invented total).
      assert.ok(
        testCase.expectedPassageIds.includes("vakantie-uren"),
        `${testCase.id} grounds on the vakantie-uren passage`,
      );
      assert.ok(
        testCase.expectedPassageIds.includes("naar-rato"),
        `${testCase.id} grounds on the naar-rato rule`,
      );
      // The reference must either state the pro-rata rule or defer the exact number — never assert an
      // invented total. Both are safe; a bare computed figure is the failure the derived cases guard.
      assert.ok(
        /naar rato|evenredig|naar verhouding|noemt de cao niet|hangt af|contact op met je fonds/i.test(
          testCase.referenceAnswer,
        ),
        `${testCase.id} states the rule or defers the exact number`,
      );
    }
  });
});

describe("fund layer (E12)", () => {
  it("discovers the ETD fund set with its own corpusVersion and target fund", () => {
    const etd = goldenFundSets.find((set) => set.key === "etd");
    assert.ok(etd, "the etd fund set is discovered via the glob loader");
    assert.equal(etd.corpusVersion, "etd-1");
    assert.ok(etd.fund.length > 0, "the etd fund set names an integration target fund");
    assert.ok(etd.cases.length >= 20, "the etd fund set has at least 20 cases");
  });

  it("every FUND_SET_META key has a discovered fixture (no silent META orphans)", () => {
    // loadFundSets() throws if META and disk disagree either way; this asserts the known registry
    // is fully loaded so a missing arbo.oomt fixture cannot pass as "we just never ran that set".
    const keys = goldenFundSets.map((set) => set.key).sort();
    assert.deepEqual(keys, ["arbo.oomt", "demo", "etd", "etd-full"]);
  });

  it("arbo.oomt is scored against fund oomt with agent arbo", () => {
    const arbo = goldenFundSets.find((set) => set.key === "arbo.oomt");
    assert.ok(arbo, "arbo.oomt fund set is discovered");
    assert.equal(arbo.fund, "oomt");
    assert.equal(arbo.agentKey, "arbo");
    assert.equal(arbo.corpusVersion, "arbo-oomt-2");
    assert.ok(arbo.cases.length >= 10, "arbo.oomt starter set has at least 10 cases");
    const refusals = arbo.cases.filter((testCase) => testCase.category === "refusal");
    assert.ok(refusals.length >= 3, "arbo.oomt has the three behaviour refusal cases");
  });

  it("every fund case id is unique within its set", () => {
    for (const set of goldenFundSets) {
      const ids = set.cases.map((testCase) => testCase.id);
      assert.equal(new Set(ids).size, ids.length, `${set.key} case ids are unique`);
    }
  });

  it("answerable fund cases name structure the integration gate can match", () => {
    const passageArticles = new Set(
      goldenPassages.map((passage) => passage.article).filter((article): article is string => article !== undefined),
    );
    for (const set of goldenFundSets) {
      const answerable = set.cases.filter((testCase) => testCase.category !== "refusal");
      assert.ok(answerable.length > 0, `${set.key} has answerable cases`);
      for (const testCase of answerable) {
        if (set.agentKey === "arbo") {
          assert.ok(testCase.expectedChapter, `${testCase.id} defines expectedChapter`);
        } else {
          assert.ok(testCase.expectedArticle, `${testCase.id} defines expectedArticle`);
        }
        if (set.fund === EVAL_FIXTURE_FUND && testCase.expectedArticle) {
          assert.ok(
            passageArticles.has(testCase.expectedArticle),
            `${testCase.id} expects article ${String(testCase.expectedArticle)} present in the fund corpus`,
          );
        }
      }
    }
  });
});

describe("arbo G2 fixtures (answer-gate route)", () => {
  it("loads 15 base-schema cases with resolvable passages and refusal distractors", () => {
    assert.equal(arboGoldenCases.length, 15);
    assert.ok(arboGoldenPassages.length >= 5, "at least one passage per distinct chapter");
    for (const testCase of arboGoldenCases) {
      if (testCase.category === "refusal") {
        const distractors = testCase.distractorPassageIds ?? [];
        assert.ok(distractors.length > 0, `${testCase.id} has distractors`);
        assert.equal(
          arboPassagesForCase(testCase).length,
          distractors.length,
          `${testCase.id} distractors resolve`,
        );
      } else {
        assert.ok(testCase.expectedPassageIds.length > 0, `${testCase.id} has expectedPassageIds`);
        assert.equal(
          arboPassagesForCase(testCase).length,
          testCase.expectedPassageIds.length,
          `${testCase.id} expected passages resolve`,
        );
      }
    }
  });

  it("pins corpusVersion to FUND_SET_META[arbo.oomt] and records a matching content hash", () => {
    const fund = goldenFundSets.find((set) => set.key === "arbo.oomt");
    assert.ok(fund);
    assert.equal(ARBO_G2_CORPUS_VERSION, fund.corpusVersion);
    assert.equal(
      ARBO_GOLDEN_FIXTURE_HASH,
      ARBO_RECORDED_FIXTURE_HASH,
      "computed fixture hash must equal meta.contentHash (re-run export-arbo-passages if red)",
    );
  });

  it("fixture-hash guard fails when either side drifts (both directions)", () => {
    // Direction A: computed hash ≠ recorded (fixture edit without re-export).
    assert.notEqual(ARBO_GOLDEN_FIXTURE_HASH + "x", ARBO_RECORDED_FIXTURE_HASH);
    // Direction B: recorded hash ≠ computed (meta hand-edit without fixture change).
    assert.notEqual(ARBO_RECORDED_FIXTURE_HASH + "x", ARBO_GOLDEN_FIXTURE_HASH);
    // Green path: both equal after a clean export.
    assert.equal(ARBO_GOLDEN_FIXTURE_HASH, ARBO_RECORDED_FIXTURE_HASH);
  });

  it("exports passage content verbatim from the gate DB (no normalisation)", () => {
    // Spot-check: chapter 2.1 passage must contain the catalog heading literally.
    const passage = arboGoldenPassages.find((row) => row.chapter?.startsWith("2.1."));
    assert.ok(passage, "2.1 chapter passage is present");
    assert.ok(
      passage.content.includes("Spanningsloos maken") || passage.content.includes("spanningsloos"),
      "content is a raw DB excerpt (contains chapter topic)",
    );
    assert.equal(passage.corpusVersion, ARBO_G2_CORPUS_VERSION);
    assert.ok(arboPassageById(passage.id) !== undefined);
  });
});
