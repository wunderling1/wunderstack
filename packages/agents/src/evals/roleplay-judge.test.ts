import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aggregateRoleplayReviews,
  aggregateRoleplayTurns,
  asksQuestion,
  detectLiteralLeaks,
  detectPersonaBreaks,
  parseRoleplayJudgeOutput,
  type RoleplayReviewRun,
  type RoleplayTurnScore,
} from "./roleplay-judge";

/**
 * Offline tests for the roleplay scorers (`test:unit`, no keys). The detectors are the blocking half
 * of G2-roleplay-persona, so what they do and do NOT fire on is pinned here rather than discovered
 * during a live run — a false positive turns a gate red for a reason that is not there.
 */

describe("detectPersonaBreaks", () => {
  it("passes an in-role deflection of an is-this-an-AI question", () => {
    assert.deepEqual(
      detectPersonaBreaks("Wat is dat nou voor vraag. Ik wil gewoon mijn geld terug."),
      [],
    );
  });

  it("catches the persona admitting what it is", () => {
    assert.deepEqual(detectPersonaBreaks("Ik ben een AI-assistent, dus dat kan ik niet zeggen."), [
      "admits to being a model",
    ]);
  });

  it("catches talk about the exercise itself", () => {
    assert.deepEqual(
      detectPersonaBreaks("Zullen we het rollenspel even pauzeren om je leerdoel te bespreken?"),
      ["talks about the exercise"],
    );
  });

  it("catches a speaker label, which the prompt forbids literally", () => {
    assert.deepEqual(detectPersonaBreaks('Klant: "Dit slaat nergens op."'), [
      "prefixes its reply with a speaker label",
    ]);
  });

  it("does not read an ordinary capitalised opener as a speaker label", () => {
    assert.deepEqual(detectPersonaBreaks("Let op: ik heb dat geld nu nodig."), []);
    assert.deepEqual(detectPersonaBreaks("Nee joh. Dat ga ik echt niet doen."), []);
  });
});

describe("detectLiteralLeaks", () => {
  const facts = ["boventallig", "ander werk"];

  it("finds a marker regardless of casing", () => {
    assert.deepEqual(detectLiteralLeaks("Ik ben Boventallig verklaard.", facts), ["boventallig"]);
  });

  it("stays silent on a reply that only hints", () => {
    assert.deepEqual(detectLiteralLeaks("Er speelt meer, maar dat gaat u niets aan.", facts), []);
  });
});

describe("asksQuestion", () => {
  it("is a question mark, minus the tag questions", () => {
    assert.equal(asksQuestion("Dan spreken we dat zo af."), false);
    assert.equal(asksQuestion("En hoe moet dat dan verder?"), true);
  });

  it("does not count a nod-seeking tag on the end of a closing statement", () => {
    assert.equal(
      asksQuestion("Ik ga er even over nadenken en dan laat ik het je weten, oké?"),
      false,
    );
    assert.equal(asksQuestion("Dan doen we dat zo, afgesproken?"), false);
  });

  it("still counts a real question that happens to end on a tag word", () => {
    assert.equal(asksQuestion("Is dat goed?"), true);
    assert.equal(asksQuestion("Bedankt, en wat vind jij?"), true);
  });

  it("counts a second, real question next to a tag one", () => {
    assert.equal(asksQuestion("Prima, oké? En hoeveel kost dat dan?"), true);
  });
});

describe("parseRoleplayJudgeOutput", () => {
  it("accepts the documented shape, fenced or not", () => {
    const parsed = parseRoleplayJudgeOutput('```json\n{"inRole":0.9,"revealed":0,"closes":1}\n```');
    assert.equal(parsed.inRole, 0.9);
    assert.equal(parsed.revealed, 0);
    assert.equal(parsed.closes, 1);
  });

  it("throws rather than defaulting a score", () => {
    assert.throws(() => parseRoleplayJudgeOutput("geen json"), /no JSON object/);
    assert.throws(() => parseRoleplayJudgeOutput('{"inRole":1.4,"revealed":0,"closes":0}'));
    // A missing dimension is a missing measurement, not a zero.
    assert.throws(() => parseRoleplayJudgeOutput('{"inRole":0.9,"revealed":0}'));
  });
});

function turn(overrides: Partial<RoleplayTurnScore> = {}): RoleplayTurnScore {
  return {
    id: "rp-x",
    category: "in-role",
    scenarioKey: "s",
    reveal: "forbidden",
    isClosingTurn: false,
    reply: "Nee joh.",
    conversationEnd: false,
    endPermitted: false,
    personaBreaks: [],
    literalLeaks: [],
    inRole: 1,
    judgedReveal: false,
    judgedClose: false,
    ...overrides,
  };
}

describe("aggregateRoleplayTurns", () => {
  it("counts a paraphrased leak the literal detector cannot see", () => {
    const aggregate = aggregateRoleplayTurns([turn({ judgedReveal: true })]);
    assert.equal(aggregate.earlyRevealCount, 1);
    assert.equal(aggregate.literalLeakCount, 0);
    assert.equal(aggregate.judgedRevealCount, 1);
  });

  it("does not count disclosure after a targeted probe as an early reveal", () => {
    const aggregate = aggregateRoleplayTurns([
      turn({ reveal: "allowed", judgedReveal: true, literalLeaks: ["boventallig"] }),
    ]);
    assert.equal(aggregate.earlyRevealCount, 0);
    assert.equal(aggregate.revealOnProbeCount, 1);
    assert.equal(aggregate.probeCount, 1);
  });

  it("counts an ending on a turn where ending was not permitted", () => {
    const aggregate = aggregateRoleplayTurns([
      turn({ id: "early", endPermitted: false, conversationEnd: true, judgedClose: true }),
      turn({ id: "allowed", endPermitted: true, conversationEnd: true, judgedClose: true }),
    ]);
    assert.equal(aggregate.prematureEndCount, 1);
    assert.equal(aggregate.endFlagMismatchCount, 0);
  });

  it("counts a goodbye that leaves the session open, and a flag with no goodbye behind it", () => {
    const aggregate = aggregateRoleplayTurns([
      turn({ id: "words-only", endPermitted: true, judgedClose: true, conversationEnd: false }),
      turn({ id: "flag-only", endPermitted: true, judgedClose: false, conversationEnd: true }),
      turn({ id: "agreed", endPermitted: true, judgedClose: true, conversationEnd: true }),
    ]);
    assert.equal(aggregate.endFlagMismatchCount, 2);
    assert.equal(aggregate.openEndedCloseCount, 1);
    assert.equal(aggregate.silentEndCount, 1);
  });

  it("keeps the closing turn out of the mismatch count, where the flag is forced anyway", () => {
    const aggregate = aggregateRoleplayTurns([
      turn({
        id: "closing",
        isClosingTurn: true,
        endPermitted: true,
        conversationEnd: true,
        judgedClose: false,
        reply: "Ik ga ervoor.",
      }),
    ]);
    assert.equal(aggregate.endFlagMismatchCount, 0);
    assert.equal(aggregate.unclosedClosingTurnCount, 1);
    assert.equal(aggregate.closingTurnCount, 1);
  });

  it("does not count a persona that declines to end a conversation it was allowed to end", () => {
    const aggregate = aggregateRoleplayTurns([
      turn({ id: "declines", endPermitted: true, judgedClose: false, conversationEnd: false }),
    ]);
    assert.equal(aggregate.endFlagMismatchCount, 0);
    assert.equal(aggregate.prematureEndCount, 0);
  });

  it("only counts a trailing question against a closing turn", () => {
    const aggregate = aggregateRoleplayTurns([
      turn({ id: "mid", reply: "En hoe zit dat dan?" }),
      turn({
        id: "closing",
        isClosingTurn: true,
        endPermitted: true,
        conversationEnd: true,
        judgedClose: true,
        reply: "Prima, dan doen we dat zo?",
      }),
    ]);
    assert.equal(aggregate.closingQuestionCount, 1);
  });

  it("carries the generation failures the run survived through to the aggregate", () => {
    const aggregate = aggregateRoleplayTurns([turn()], 2);
    assert.equal(aggregate.generationFailureCount, 2);
    assert.equal(aggregate.caseCount, 1);
  });

  it("reports a judged-only break separately from a deterministic one", () => {
    const aggregate = aggregateRoleplayTurns([
      turn({ id: "hard", personaBreaks: ["admits to being a model"], inRole: 0 }),
      turn({ id: "soft", inRole: 0.2 }),
    ]);
    assert.equal(aggregate.personaBreakCount, 1);
    assert.equal(aggregate.softBreakCount, 1);
    assert.equal(aggregate.inRoleScore, 0.1);
  });
});

function run(overrides: Partial<RoleplayReviewRun> = {}): RoleplayReviewRun {
  return {
    weightedScore: 7,
    passed: true,
    modelReportedPassed: true,
    criteriaCount: 3,
    unscoredCount: 0,
    questionsVerbatim: true,
    completionTokens: 900,
    ...overrides,
  };
}

describe("aggregateRoleplayReviews", () => {
  const strong = { id: "strong", expectedRank: 1, expectPass: true };
  const weak = { id: "weak", expectedRank: 2, expectPass: false };

  it("is clean when both transcripts hold their order in every repeat", () => {
    const aggregate = aggregateRoleplayReviews([
      { testCase: strong, runs: [run({ weightedScore: 7.4 }), run({ weightedScore: 7.1 })], rubricLength: 3 },
      {
        testCase: weak,
        runs: [
          run({ weightedScore: 4.2, passed: false, modelReportedPassed: false }),
          run({ weightedScore: 4.5, passed: false, modelReportedPassed: false }),
        ],
        rubricLength: 3,
      },
    ]);
    assert.equal(aggregate.orderingViolations, 0);
    assert.equal(aggregate.passFlipCount, 0);
    assert.equal(aggregate.repeats, 2);
    assert.equal(aggregate.expectedVerdictRate, 1);
  });

  it("flags a per-repeat order flip that the means would hide", () => {
    const aggregate = aggregateRoleplayReviews([
      { testCase: strong, runs: [run({ weightedScore: 8 }), run({ weightedScore: 4 })], rubricLength: 3 },
      { testCase: weak, runs: [run({ weightedScore: 3 }), run({ weightedScore: 5 })], rubricLength: 3 },
    ]);
    // Mean 6.0 vs 4.0 looks fine; the second repeat has them the wrong way round.
    assert.equal(aggregate.orderingViolations, 1);
  });

  it("flags a pass/fail flip and reports the spread that caused it", () => {
    const aggregate = aggregateRoleplayReviews([
      {
        testCase: strong,
        runs: [run({ weightedScore: 5.9, passed: true }), run({ weightedScore: 4.4, passed: false })],
        rubricLength: 3,
      },
      { testCase: weak, runs: [run({ weightedScore: 2 }), run({ weightedScore: 2 })], rubricLength: 3 },
    ]);
    assert.equal(aggregate.passFlipCount, 1);
    assert.equal(aggregate.maxScoreSpread.toFixed(1), "1.5");
  });

  it("counts a review whose criteria no longer match the rubric", () => {
    const aggregate = aggregateRoleplayReviews([
      { testCase: strong, runs: [run({ criteriaCount: 2 }), run({ questionsVerbatim: false })], rubricLength: 3 },
      { testCase: weak, runs: [run({ weightedScore: 2 }), run({ weightedScore: 2 })], rubricLength: 3 },
    ]);
    assert.equal(aggregate.shapeFailureCount, 2);
  });

  it("counts a repeat that produced no review, and keeps the rest of the case measurable", () => {
    const aggregate = aggregateRoleplayReviews([
      {
        testCase: strong,
        runs: [run({ weightedScore: 7.4 })],
        rubricLength: 3,
        missingReviews: 1,
      },
      { testCase: weak, runs: [run({ weightedScore: 2, passed: false })], rubricLength: 3 },
    ]);
    assert.equal(aggregate.missingReviewCount, 1);
    assert.equal(aggregate.repeats, 1);
    assert.equal(aggregate.orderingViolations, 0);
  });

  it("tracks how often the model's own verdict matches the computed one", () => {
    const aggregate = aggregateRoleplayReviews([
      { testCase: strong, runs: [run({ modelReportedPassed: false })], rubricLength: 3 },
      { testCase: weak, runs: [run({ weightedScore: 2, passed: false, modelReportedPassed: false })], rubricLength: 3 },
    ]);
    assert.equal(aggregate.modelPassAgreementRate, 0.5);
  });
});
