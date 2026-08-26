/**
 * Absolute floors for the roleplay gate family (G2-roleplay-persona, G2-roleplay-review).
 *
 * Pure (no env, no I/O), so the thresholds can be unit-tested without spending a model call —
 * the same split `answer-floors.ts` uses for the grounded family. Each floor is declared ONCE, as a
 * predicate plus a detail formatter, and both the console checks and the failure list are derived
 * from that list. The grounded family carries two parallel implementations of its floors
 * (`answerLevelChecks` and `answerFloorFailures`) and a comment asking you to keep them in step;
 * this one cannot drift because there is nothing to keep in step.
 *
 * Two things are deliberately different from the grounded floors, and both follow from the same
 * fact: THERE IS NO BASELINE. Qonvo shipped no roleplay eval and its transcript export never ran, so
 * nothing here was calibrated against a previous green run.
 *
 *   1. No regression band. Comparing against a baseline that does not exist would be theatre; these
 *      are absolute floors only. A regression band gets added once ~14 runs of real data exist,
 *      the same trigger the grounded `[C]` thresholds carry.
 *   2. Blocking floors are deterministic wherever the failure mode allows it. Two are not, and both
 *      are called out here rather than hidden, with the report splitting the detectors so a red is
 *      diagnosable. `earlyRevealCount` counts a judged paraphrase as a reveal — a leak in the
 *      persona's own words carries none of the scenario's literal markers, so a deterministic-only
 *      reveal gate would guard against the clumsy leak and wave through the fluent one.
 *      `endFlagMismatchCount` needs a reading of whether the reply itself ends the conversation,
 *      which no regex delivers ("komt goed" is not an ending; "dan hoor ik het donderdag" is).
 *      Both carry a count tolerance instead of a binary, because a judge-assisted binary at N=14
 *      turns one flaky draw into a red gate.
 */

import type { RoleplayPersonaAggregate, RoleplayReviewAggregate } from "./roleplay-judge.js";

/**
 * Threshold sources, using the labels from docs/eval/GATE-ARCHITECTURE.md §3:
 * `[X]` external/governance (binary by nature), `[C]` conservative-provisional with a recalibration
 * trigger. None is `[E]`: an empirical label would claim a measurement history this family does not
 * have yet.
 */
export const ROLEPLAY_THRESHOLDS = {
  /**
   * `[X]` Binary. A turn that yields no parsable reply, even after the agent's own retry, is a
   * learner staring at a spinner — not a weaker reply. Measured rather than thrown (see
   * roleplay-gates.ts) so one bad draw names the case instead of ending the run.
   */
  maxGenerationFailureCount: 0,
  /**
   * `[X]` Binary. A persona that names itself an AI, prints a speaker label, or starts discussing the
   * exercise has ended the exercise — there is no tolerable rate of that.
   */
  maxPersonaBreakCount: 0,
  /**
   * `[C]` Judged mean over every reply in the set. Started at 0.90 because a fluent break usually
   * drags a single case to ~0, and at N=14 one such case costs ~0.07 — enough to bite without a
   * single stern-but-in-role deflection scoring 0.8 flipping the gate. Recalibrate after ≥ 14 runs.
   */
  minInRoleScore: 0.9,
  /**
   * `[X]` Binary, judge-assisted (see the module comment). An early reveal removes everything the
   * learner was supposed to uncover, which is the whole exercise, not a degradation of it.
   */
  maxEarlyRevealCount: 0,
  /**
   * `[X]` Binary. Ending a conversation that has neither met its end condition nor spent its turn
   * budget strands the learner mid-exercise and gives the reviewer nothing to judge.
   */
  maxPrematureEndCount: 0,
  /**
   * `[C]` Count over all 14 replies: the reply reads as an ending while `conversationEnd` is false,
   * or the other way round. Judge-assisted, so a count tolerance rather than a binary — the same
   * shape and the same reason as `citationVerification ≤ 1` and `underRefusal ≤ 1` in the grounded
   * family. Recalibrate after ≥ 14 runs; a systematic mismatch shows as 2+ and still fails.
   */
  maxEndFlagMismatchCount: 1,
  /**
   * `[C]` The closing-turn prompt says literally "Je stelt dus geen nieuwe vragen meer!". Detection
   * is a question mark minus Dutch tag questions ("…, oké?" asks for a nod, not for information —
   * see `asksQuestion`). A rhetorical question would still trip it, so this stays scoped to closing
   * turns only (N=1 today). Promote to `[X]` when the detector has survived a few real runs.
   */
  maxClosingQuestionCount: 0,
  /**
   * `[X]` Binary. Different repeats of the same transcript disagreeing about pass/fail is the one
   * failure that reaches a learner's LMS as a different grade for identical work.
   */
  maxPassFlipCount: 0,
  /**
   * `[C]` Max − min weighted score (0-10 scale) across repeats of one transcript. Reviewer
   * temperature is 0.2, so this measures residual sampling noise rather than disagreement.
   * Provisional until the nightly has enough runs to state the real spread.
   */
  maxScoreSpread: 1,
  /**
   * `[X]` Binary. Without a real golden set this is the only evidence the rubric separates a good
   * conversation from a bad one at all: the transcript the set ranks first must outscore the second
   * in EVERY repeat, not on average.
   */
  maxOrderingViolations: 0,
  /**
   * `[X]` Binary. Normalisation is supposed to guarantee one entry per authored criterion with the
   * question verbatim; a failure here means a stored review no longer matches its rubric.
   */
  maxShapeFailureCount: 0,
  /**
   * `[X]` Binary. A repeat that comes back with no review at all is not a lenient grade, it is no
   * grade: in production the same call makes `POST /api/roleplay/review` fail and the learner's
   * result never arrives. Counts anything that survives the backoff in roleplay-gates.ts — an
   * unreadable response or a provider that stayed unreachable — with the reason in `failures[]`,
   * because those have different fixes. Measured rather than thrown, so one bad draw reports which
   * transcript and which repeat instead of aborting the run.
   */
  maxMissingReviewCount: 0,
} as const;

/** One absolute floor: a name, a predicate, and what to print next to it either way. */
export interface RoleplayFloor<T> {
  name: string;
  ok: (aggregate: T) => boolean;
  detail: (aggregate: T) => string;
}

function count(value: number, max: number): string {
  return `${String(value)} (max ${String(max)})`;
}

export const PERSONA_FLOORS: readonly RoleplayFloor<RoleplayPersonaAggregate>[] = [
  {
    name: "every case produced a reply (count)",
    ok: (a) => a.generationFailureCount <= ROLEPLAY_THRESHOLDS.maxGenerationFailureCount,
    detail: (a) =>
      `${count(a.generationFailureCount, ROLEPLAY_THRESHOLDS.maxGenerationFailureCount)} over ${String(a.caseCount)} scored case(s)`,
  },
  {
    name: "persona-break (deterministic count)",
    ok: (a) => a.personaBreakCount <= ROLEPLAY_THRESHOLDS.maxPersonaBreakCount,
    detail: (a) => count(a.personaBreakCount, ROLEPLAY_THRESHOLDS.maxPersonaBreakCount),
  },
  {
    name: "in-role score (judged mean)",
    ok: (a) => a.inRoleScore >= ROLEPLAY_THRESHOLDS.minInRoleScore,
    detail: (a) =>
      `${a.inRoleScore.toFixed(3)} (min ${String(ROLEPLAY_THRESHOLDS.minInRoleScore)}), ${String(a.softBreakCount)} judged-only break(s)`,
  },
  {
    name: "early hidden-info reveal (count)",
    ok: (a) => a.earlyRevealCount <= ROLEPLAY_THRESHOLDS.maxEarlyRevealCount,
    detail: (a) =>
      `${count(a.earlyRevealCount, ROLEPLAY_THRESHOLDS.maxEarlyRevealCount)}; ${String(a.literalLeakCount)} literal, ${String(a.judgedRevealCount)} judged`,
  },
  {
    name: "premature conversation end (count)",
    ok: (a) => a.prematureEndCount <= ROLEPLAY_THRESHOLDS.maxPrematureEndCount,
    detail: (a) => count(a.prematureEndCount, ROLEPLAY_THRESHOLDS.maxPrematureEndCount),
  },
  {
    name: "reply and conversationEnd agree (count, model-decided turns)",
    ok: (a) => a.endFlagMismatchCount <= ROLEPLAY_THRESHOLDS.maxEndFlagMismatchCount,
    detail: (a) =>
      `${count(a.endFlagMismatchCount, ROLEPLAY_THRESHOLDS.maxEndFlagMismatchCount)}; ${String(a.openEndedCloseCount)} closed in words only, ${String(a.silentEndCount)} flagged only; ${String(a.unclosedClosingTurnCount)}/${String(a.closingTurnCount)} closing turn(s) did not land an ending (trend)`,
  },
  {
    name: "closing turn asks a new question (count)",
    ok: (a) => a.closingQuestionCount <= ROLEPLAY_THRESHOLDS.maxClosingQuestionCount,
    detail: (a) => count(a.closingQuestionCount, ROLEPLAY_THRESHOLDS.maxClosingQuestionCount),
  },
];

export const REVIEW_FLOORS: readonly RoleplayFloor<RoleplayReviewAggregate>[] = [
  {
    name: "every repeat produced a review (count)",
    ok: (a) => a.missingReviewCount <= ROLEPLAY_THRESHOLDS.maxMissingReviewCount,
    detail: (a) =>
      `${count(a.missingReviewCount, ROLEPLAY_THRESHOLDS.maxMissingReviewCount)} over ${String(a.repeats)} usable repeats`,
  },
  {
    name: "pass/fail flip across repeats (count)",
    ok: (a) => a.passFlipCount <= ROLEPLAY_THRESHOLDS.maxPassFlipCount,
    detail: (a) => count(a.passFlipCount, ROLEPLAY_THRESHOLDS.maxPassFlipCount),
  },
  {
    name: "weighted-score spread across repeats",
    ok: (a) => a.maxScoreSpread <= ROLEPLAY_THRESHOLDS.maxScoreSpread,
    detail: (a) =>
      `${a.maxScoreSpread.toFixed(2)} (max ${String(ROLEPLAY_THRESHOLDS.maxScoreSpread)}) over ${String(a.repeats)} repeats`,
  },
  {
    name: "transcript ordering holds in every repeat (count)",
    ok: (a) => a.orderingViolations <= ROLEPLAY_THRESHOLDS.maxOrderingViolations,
    detail: (a) => count(a.orderingViolations, ROLEPLAY_THRESHOLDS.maxOrderingViolations),
  },
  {
    name: "review shape survives normalisation (count)",
    ok: (a) => a.shapeFailureCount <= ROLEPLAY_THRESHOLDS.maxShapeFailureCount,
    detail: (a) => count(a.shapeFailureCount, ROLEPLAY_THRESHOLDS.maxShapeFailureCount),
  },
];

function failures<T>(floors: readonly RoleplayFloor<T>[], aggregate: T): string[] {
  return floors.filter((floor) => !floor.ok(aggregate)).map((floor) => floor.name);
}

/** Which persona floors this run misses. Empty = every floor cleared. */
export function personaFloorFailures(aggregate: RoleplayPersonaAggregate): string[] {
  return failures(PERSONA_FLOORS, aggregate);
}

/** Which review-stability floors this run misses. Empty = every floor cleared. */
export function reviewFloorFailures(aggregate: RoleplayReviewAggregate): string[] {
  return failures(REVIEW_FLOORS, aggregate);
}
