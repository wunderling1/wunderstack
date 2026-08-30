import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { EVAL_FIXTURE_FUND } from "@wunderstack/shared";

import { parseFundSetProfile } from "./fund-set-profile.js";
import {
  FUND_SET_PROFILE_SUBDIR,
  goldenCaseSchema,
  goldenCases,
  goldenFundSets,
  goldenPassages,
  loadFundSetProfiles,
  loadFundSetsFrom,
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

  it("every fixture has a profile sidecar and every profile has a fixture", () => {
    const profiles = loadFundSetProfiles();
    const keys = goldenFundSets.map((set) => set.key).sort();
    const profileKeys = profiles.map((profile) => profile.key).sort();
    assert.deepEqual(profileKeys, keys);
    assert.ok(keys.length >= 1, "at least one fund set is discovered");
  });

  it("every profile validates against the Zod schema", () => {
    for (const profile of loadFundSetProfiles()) {
      assert.deepEqual(parseFundSetProfile(profile), profile);
    }
  });

  it("throws when a fixture has no profile sidecar", () => {
    const dir = mkdtempSync(join(tmpdir(), "fund-sets-"));
    mkdirSync(join(dir, FUND_SET_PROFILE_SUBDIR), { recursive: true });
    writeFileSync(join(dir, "golden-set.probe.jsonl"), '{"id":"p1","question":"q?","expectedPassageIds":[],"referenceAnswer":"r","category":"in_scope","expectedArticle":"1"}\n', "utf8");
    assert.throws(() => loadFundSetsFrom(dir), /no profile sidecar/);
  });

  it("throws when a profile has no fixture file", () => {
    const dir = mkdtempSync(join(tmpdir(), "fund-sets-"));
    mkdirSync(join(dir, FUND_SET_PROFILE_SUBDIR), { recursive: true });
    writeFileSync(
      join(dir, FUND_SET_PROFILE_SUBDIR, "orphan.json"),
      JSON.stringify({
        key: "orphan",
        fund: "orphan-fund",
        agentKey: "cao",
        corpusVersion: "orphan-1",
        contentStatus: "scaffold",
      }),
      "utf8",
    );
    assert.throws(() => loadFundSetsFrom(dir), /has no fixture file/);
  });

  it("throws when a profile references an unknown agentKey", () => {
    const dir = mkdtempSync(join(tmpdir(), "fund-sets-"));
    mkdirSync(join(dir, FUND_SET_PROFILE_SUBDIR), { recursive: true });
    writeFileSync(join(dir, "golden-set.probe.jsonl"), '{"id":"p1","question":"q?","expectedPassageIds":[],"referenceAnswer":"r","category":"in_scope","expectedArticle":"1"}\n', "utf8");
    writeFileSync(
      join(dir, FUND_SET_PROFILE_SUBDIR, "probe.json"),
      JSON.stringify({
        key: "probe",
        fund: "probe-fund",
        agentKey: "unknown-agent",
        corpusVersion: "probe-1",
        contentStatus: "scaffold",
      }),
      "utf8",
    );
    assert.throws(() => loadFundSetsFrom(dir), /not registered in AGENT_EVAL_PROFILES/);
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
