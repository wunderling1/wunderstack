import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { goldenCaseSchema, goldenCases, passagesForCase } from "./golden-set.js";

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
    assert.ok(refusals.length > 0, "there is at least one refusal case");
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
});
