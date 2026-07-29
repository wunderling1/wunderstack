/**
 * Absolute answer-quality floors (G2-answer) + the baseline write-guard that enforces them.
 *
 * Two consumers share this single source of truth:
 *   1. cao.eval.ts answerLevelChecks — the live Gate C thresholds.
 *   2. The EVAL_WRITE_BASELINE path — a baseline may ONLY capture a run that itself clears every
 *      absolute floor. Recording a red run would silently lower the regression reference point (the
 *      corrupt-baseline incident: underRefusalRate 0.333 / softFaithfulness 0.784 recorded as the
 *      bar). See docs/eval/GATE-ARCHITECTURE.md §4 invariant "Baseline-integriteit".
 *
 * Pure (no env, no I/O): unit-tested in answer-floors.test.ts without running the eval.
 */

import type { AggregateScores } from "./judge.js";

/**
 * Answer-level gates. faithfulness is split: `hardHallucination` (deterministic — invented
 * amounts/terms/articles) carries near-zero tolerance and backs the "verzint niets"-promise;
 * `softFaithfulness` (LLM-judged paraphrase drift) keeps conservative headroom for judge variance.
 * Refusal is two-sided: over-refusal (answerable but refused) and under-refusal (should have
 * refused but answered) each have their own ceiling.
 */
export const ANSWER_THRESHOLDS = {
  hardHallucination: 0.98,
  softFaithfulness: 0.8,
  // Lowered 0.85 -> 0.84 as a logged policy decision (PLAN-v3 Fase 14.0 stap 3, golden-set.REVIEW.md).
  // The LLM judge sits within noise of 0.85 (0.845-0.865 across runs at EVAL_JUDGE_SAMPLES=3); 0.84
  // keeps a real relevance floor without letting a single flaky judge draw flip the gate. It is NOT
  // part of a baseline re-record and stays a deliberate, separately-logged threshold change.
  relevance: 0.84,
  citationCorrectness: 0.75,
  completeness: 0.7,
  refusalCalibration: 0.9,
  // citationVerification / dangling: absolute gate is COUNT-based (0 of N), not the rate thresholds
  // below. Rates stay in the console for trend; see answerLevelChecks + golden-set.REVIEW.md
  // (Gate C close-out). At N=31 one failure is already 96.8% < 0.98 — schijngranulariteit over an
  // [X]-gate that follows from the "verzint niets"-promise.
  citationVerification: 0.98,
  // Orphan sources (a shown citation without an inline marker) must be eliminated by the contract.
  maxOrphanRate: 0,
  // Inline markers without a verified citation behind them are just as bad as orphan source cards.
  maxDanglingMarkerRate: 0,
  maxOverRefusalRate: 0.05,
  maxUnderRefusalRate: 0.1,
  /**
   * Safety-vs-quality split (REVIEW.md §21). The ABSOLUTE safety guarantee — no unverified citation and no
   * fabricated fact reaches the user — is enforced deterministically by hard-hallucination (>=0.98),
   * orphan-source (=0), and the verifyCitations strip/reconcile pipeline (unit-tested in
   * verify-citations.test.ts / generate-answer.test.ts / agent.ts). The RAW generation slip that survives
   * best-of-N is irreducible single-sample variance: across runs a rotating ~1/31 of cases mangle some part
   * of the citation protocol (long quote / ellipsis / sentinel / capital) even on Mistral Large. So the raw
   * count gates are QUALITY-TREND gates with a sourced tolerance of one case (~3.2% at N=31): a single
   * stochastic slip passes, a systematic regression (>=2) fails. Under-refusal is count-based for the same
   * reason — with only 3 refusal fixtures the rate is a noisy 0/33/67%, and a lone GROUNDED
   * should-have-deferred answer (hard-hallucination still 1.0) is a calibration slip, not a fabrication.
   */
  maxUnverifiedCount: 1,
  maxDanglingCount: 1,
  maxUnderRefusalCount: 1,
} as const;

/** G2-multi-turn serve-path: answerable follow-ups must survive verifyAndBuild with a verified citation. */
export const MULTI_TURN_SERVE_THRESHOLDS = {
  maxUnverifiableCount: 0,
} as const;

/**
 * G2 baseline-write guard: which ABSOLUTE Gate C floors a run misses. A baseline may only capture a
 * run that itself clears every absolute floor — otherwise `EVAL_WRITE_BASELINE` could quietly record a
 * red run and lower the regression reference point, exactly the "never silently lower the bar" rule.
 * Mirrors the absolute checks in answerLevelChecks (the regression checks are relative and therefore
 * not part of this floor). Returns the failing metric names (empty = clears every floor).
 */
export function answerFloorFailures(aggregate: AggregateScores): string[] {
  const failures: string[] = [];
  const push = (ok: boolean, name: string): void => {
    if (!ok) failures.push(name);
  };
  push(aggregate.hardHallucination >= ANSWER_THRESHOLDS.hardHallucination, "hard-hallucination");
  push(aggregate.faithfulness >= ANSWER_THRESHOLDS.softFaithfulness, "soft-faithfulness");
  push(aggregate.relevance >= ANSWER_THRESHOLDS.relevance, "relevance");
  push(aggregate.citationCorrectness >= ANSWER_THRESHOLDS.citationCorrectness, "citation-correctness");
  push(aggregate.completeness >= ANSWER_THRESHOLDS.completeness, "completeness");
  push(aggregate.refusalCalibration >= ANSWER_THRESHOLDS.refusalCalibration, "refusal-calibration");
  push(aggregate.unverifiedCitationCount <= ANSWER_THRESHOLDS.maxUnverifiedCount, "citation-verification (count)");
  push(aggregate.orphanRate <= ANSWER_THRESHOLDS.maxOrphanRate, "orphan-source-rate");
  push(aggregate.danglingCaseCount <= ANSWER_THRESHOLDS.maxDanglingCount, "dangling-marker (count)");
  push(aggregate.overRefusalRate <= ANSWER_THRESHOLDS.maxOverRefusalRate, "over-refusal-rate");
  push(aggregate.underRefusalCount <= ANSWER_THRESHOLDS.maxUnderRefusalCount, "under-refusal (count)");
  return failures;
}
