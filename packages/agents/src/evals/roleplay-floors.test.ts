import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PERSONA_FLOORS,
  REVIEW_FLOORS,
  personaFloorFailures,
  reviewFloorFailures,
  ROLEPLAY_THRESHOLDS,
} from "./roleplay-floors.js";
import type { RoleplayPersonaAggregate, RoleplayReviewAggregate } from "./roleplay-judge.js";

/**
 * The roleplay floors, exercised without spending a model call. Each blocking threshold gets its own
 * violation so a future loosening shows up as a failing assertion instead of a quietly greener run —
 * the same protection `answer-floors.test.ts` gives the grounded family.
 */

function persona(overrides: Partial<RoleplayPersonaAggregate> = {}): RoleplayPersonaAggregate {
  return {
    caseCount: 14,
    generationFailureCount: 0,
    personaBreakCount: 0,
    inRoleScore: 1,
    softBreakCount: 0,
    earlyRevealCount: 0,
    literalLeakCount: 0,
    judgedRevealCount: 0,
    revealOnProbeCount: 1,
    probeCount: 1,
    prematureEndCount: 0,
    endFlagMismatchCount: 0,
    openEndedCloseCount: 0,
    silentEndCount: 0,
    unclosedClosingTurnCount: 0,
    closingTurnCount: 1,
    closingQuestionCount: 0,
    ...overrides,
  };
}

function review(overrides: Partial<RoleplayReviewAggregate> = {}): RoleplayReviewAggregate {
  return {
    repeats: 3,
    cases: [],
    maxScoreSpread: 0.3,
    passFlipCount: 0,
    shapeFailureCount: 0,
    missingReviewCount: 0,
    orderingViolations: 0,
    modelPassAgreementRate: 1,
    expectedVerdictRate: 1,
    ...overrides,
  };
}

describe("personaFloorFailures", () => {
  it("passes a clean run", () => {
    assert.deepEqual(personaFloorFailures(persona()), []);
  });

  it("passes exactly on the boundary", () => {
    assert.deepEqual(
      personaFloorFailures(
        persona({
          inRoleScore: ROLEPLAY_THRESHOLDS.minInRoleScore,
          endFlagMismatchCount: ROLEPLAY_THRESHOLDS.maxEndFlagMismatchCount,
        }),
      ),
      [],
    );
  });

  it("fails a case that produced no reply, even though the run continued", () => {
    assert.deepEqual(personaFloorFailures(persona({ generationFailureCount: 1, caseCount: 13 })), [
      "every case produced a reply (count)",
    ]);
  });

  it("fails one deterministic persona break", () => {
    assert.deepEqual(personaFloorFailures(persona({ personaBreakCount: 1 })), [
      "persona-break (deterministic count)",
    ]);
  });

  it("fails one early reveal, however it was detected", () => {
    assert.deepEqual(
      personaFloorFailures(persona({ earlyRevealCount: 1, judgedRevealCount: 1 })),
      ["early hidden-info reveal (count)"],
    );
  });

  it("fails one premature ending but tolerates one reply/flag mismatch", () => {
    assert.deepEqual(personaFloorFailures(persona({ prematureEndCount: 1 })), [
      "premature conversation end (count)",
    ]);
    assert.deepEqual(
      personaFloorFailures(persona({ endFlagMismatchCount: 1, openEndedCloseCount: 1 })),
      [],
    );
    assert.deepEqual(
      personaFloorFailures(
        persona({ endFlagMismatchCount: 2, openEndedCloseCount: 1, silentEndCount: 1 }),
      ),
      ["reply and conversationEnd agree (count, model-decided turns)"],
    );
  });

  it("does not gate on a closing turn that failed to land an ending (trend at N=1)", () => {
    assert.deepEqual(
      personaFloorFailures(persona({ unclosedClosingTurnCount: 1, closingTurnCount: 1 })),
      [],
    );
  });

  it("does not gate on a closing question (trend at N=1)", () => {
    assert.deepEqual(
      personaFloorFailures(persona({ closingQuestionCount: 1, closingTurnCount: 1 })),
      [],
    );
  });

  it("prints the closing-question count as trend on the mismatch floor", () => {
    const floor = PERSONA_FLOORS.find((entry) => entry.thresholdKey === "maxEndFlagMismatchCount");
    assert.ok(floor);
    assert.match(
      floor.detail(persona({ closingQuestionCount: 1, closingTurnCount: 1 })),
      /1 asked a question \(trend\)/,
    );
  });

  it("does not fail on a judged-only wobble that stays above the mean floor", () => {
    assert.deepEqual(personaFloorFailures(persona({ inRoleScore: 0.93, softBreakCount: 1 })), []);
  });
});

describe("reviewFloorFailures", () => {
  it("passes a clean run", () => {
    assert.deepEqual(reviewFloorFailures(review()), []);
  });

  it("fails a pass/fail flip on identical work", () => {
    assert.deepEqual(reviewFloorFailures(review({ passFlipCount: 1 })), [
      "pass/fail flip across repeats (count)",
    ]);
  });

  it("fails a spread beyond one grade point", () => {
    assert.deepEqual(
      reviewFloorFailures(review({ maxScoreSpread: ROLEPLAY_THRESHOLDS.maxScoreSpread })),
      [],
    );
    assert.deepEqual(reviewFloorFailures(review({ maxScoreSpread: 1.2 })), [
      "weighted-score spread across repeats",
    ]);
  });

  it("fails a single ordering violation, not an average one", () => {
    assert.deepEqual(reviewFloorFailures(review({ orderingViolations: 1 })), [
      "transcript ordering holds in every repeat (count)",
    ]);
  });

  it("fails a review that no longer matches its rubric", () => {
    assert.deepEqual(reviewFloorFailures(review({ shapeFailureCount: 1 })), [
      "review shape survives normalisation (count)",
    ]);
  });

  it("fails a repeat that produced no review at all", () => {
    assert.deepEqual(reviewFloorFailures(review({ missingReviewCount: 1, repeats: 2 })), [
      "every repeat produced a review (count)",
    ]);
  });
});

describe("floor declarations", () => {
  it("declares every floor once, so the gate checks and the guard cannot drift", () => {
    const names = [...PERSONA_FLOORS, ...REVIEW_FLOORS].map((floor) => floor.name);
    assert.equal(new Set(names).size, names.length);
  });

  it("prints a detail for every floor, pass or fail", () => {
    for (const floor of PERSONA_FLOORS) {
      assert.ok(floor.detail(persona()).length > 0, floor.name);
    }
    for (const floor of REVIEW_FLOORS) {
      assert.ok(floor.detail(review()).length > 0, floor.name);
    }
  });
});
