import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NOT_FOUND_MESSAGE } from "../cao/prompt.js";
import { CITATIONS_SENTINEL } from "../runtime/generation-schema.js";

import {
  fundAnswerLayerChecks,
  shouldRunFundAnswerLayer,
  type FundAnswerCaseServed,
} from "./fund-answer-layer.js";
import type { GoldenFundCase, GoldenPassage } from "./golden-set.js";

function passage(id: string, content: string): GoldenPassage {
  return { id, source: "test", content, article: "1", chunkType: "text" };
}

function fundCase(overrides: Partial<GoldenFundCase> & Pick<GoldenFundCase, "id" | "category">): GoldenFundCase {
  return {
    question: "Testvraag?",
    referenceAnswer: "Referentie.",
    expectedArticle: "1",
    ...overrides,
  };
}

function raw(prose: string, citations: { marker: number; chunk_id: string; quote: string }[] = []): string {
  return `${prose}\n${CITATIONS_SENTINEL}\n${JSON.stringify(citations)}`;
}

function served(
  testCase: GoldenFundCase,
  rawAnswer: string,
  passages: GoldenPassage[],
  userSupplied = "",
): FundAnswerCaseServed {
  return { testCase, rawAnswer, passages, userSupplied };
}

describe("shouldRunFundAnswerLayer", () => {
  it("is false for starter/scaffold and for fund-reviewed on the PR path", () => {
    assert.equal(shouldRunFundAnswerLayer("starter", "nightly"), false);
    assert.equal(shouldRunFundAnswerLayer("scaffold", "merge"), false);
    assert.equal(shouldRunFundAnswerLayer("fund-reviewed", "pr"), false);
  });

  it("is true for fund-reviewed on nightly and onboarding (merge)", () => {
    assert.equal(shouldRunFundAnswerLayer("fund-reviewed", "nightly"), true);
    assert.equal(shouldRunFundAnswerLayer("fund-reviewed", "merge"), true);
  });
});

describe("fundAnswerLayerChecks", () => {
  const passages = [passage("c1", "Een fulltimer heeft recht op 190 uur vakantie per jaar.")];
  const clean = served(
    fundCase({ id: "ok-1", category: "in_scope" }),
    raw("Een fulltimer heeft 190 uur vakantie [1].", [{ marker: 1, chunk_id: "c1", quote: "190 uur vakantie" }]),
    passages,
  );

  it("returns no checks for an empty served list (starter path)", () => {
    assert.deepEqual(fundAnswerLayerChecks("probe", "cao", NOT_FOUND_MESSAGE, []), []);
  });

  it("passes when every deterministic floor is clean", () => {
    const checks = fundAnswerLayerChecks("probe", "cao", NOT_FOUND_MESSAGE, [clean]);
    assert.equal(checks.length, 4);
    assert.ok(checks.every((check) => check.ok));
  });

  it("fails on a dangling marker", () => {
    const checks = fundAnswerLayerChecks("probe", "cao", NOT_FOUND_MESSAGE, [
      served(fundCase({ id: "dang-1", category: "in_scope" }), raw("Tekst [1] en meer [2].", []), passages),
    ]);
    const dangling = checks.find((check) => check.name.includes("dangling"));
    assert.equal(dangling?.ok, false);
  });

  it("fails on an unverifiable citation", () => {
    const checks = fundAnswerLayerChecks("probe", "cao", NOT_FOUND_MESSAGE, [
      served(
        fundCase({ id: "uv-1", category: "in_scope" }),
        raw("Recht op 999 uur [1].", [{ marker: 1, chunk_id: "c1", quote: "999 uur" }]),
        passages,
      ),
    ]);
    const unverifiable = checks.find((check) => check.name.includes("unverifiable"));
    assert.equal(unverifiable?.ok, false);
  });

  it("fails on an ungrounded hard fact", () => {
    const checks = fundAnswerLayerChecks("probe", "cao", NOT_FOUND_MESSAGE, [
      served(fundCase({ id: "hf-1", category: "in_scope" }), raw("Bij deeltijd is dat 120 uur.", []), passages),
    ]);
    const hardFact = checks.find((check) => check.name.includes("hard-fact"));
    assert.equal(hardFact?.ok, false);
  });

  it("fails when a near-miss case is answered instead of refused", () => {
    const checks = fundAnswerLayerChecks("probe", "cao", NOT_FOUND_MESSAGE, [
      served(
        fundCase({ id: "ref-1", category: "refusal", referenceAnswer: "Niet in de cao." }),
        raw("U krijgt 10 dagen extra verlof [1].", [{ marker: 1, chunk_id: "c1", quote: "190 uur vakantie" }]),
        passages,
      ),
    ]);
    const refusal = checks.find((check) => check.name.includes("refusal hygiene"));
    assert.equal(refusal?.ok, false);
  });
});
