import { percentagesFromRatings, type RoleplayRubric, type RubricCriterion } from "@wunderstack/shared";

import type { ResolvedRubric, ScoredCriterion, WeightedCriterion } from "./types.js";

/**
 * Rubric weighting and scoring.
 *
 * Authors give a 1-5 importance rating per criterion; the prompt and the score need percentages that
 * sum to 100. Doing that conversion here means an author can add a criterion without rebalancing
 * every other one by hand, which is the whole reason the stored weight is a rating and not a
 * percentage.
 */

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Convert author ratings into percentages summing to exactly 100.
 *
 * The arithmetic runs in integer hundredths of a percent and only becomes a decimal at the end.
 * Three equal criteria are the reason: 100/3 rounded to two decimals is 33.33, and 33.33 × 3 = 99.99.
 * A rubric whose weights do not sum to 100 quietly deflates every score computed from it. Qonvo
 * corrects for this by adjusting the last weight after the fact (`normalizeWeights` in
 * src/lib/rubric/resolve.ts); doing the division in integers means the remainder is distributed
 * exactly rather than patched, and there is no second rounding step to reintroduce drift.
 *
 * A rating that is not a positive finite number counts as zero. When that leaves nothing to divide,
 * every criterion is treated as equally important instead of failing: a rubric with no usable
 * ratings is still a rubric, and refusing to score it helps nobody.
 */
export function normalizeRubricWeights(criteria: RubricCriterion[]): WeightedCriterion[] {
  const weights = percentagesFromRatings(criteria.map((criterion) => criterion.weight));
  return criteria.map((criterion, index) => ({
    question: criterion.question,
    description: criterion.description,
    behavioralIndicators: criterion.behavioralIndicators,
    weight: weights[index] ?? 0,
  }));
}

/** Resolve an authored rubric into the prompt-ready shape: percentages plus the pass mark. */
export function resolveRubric(rubric: RoleplayRubric): ResolvedRubric {
  return {
    criteria: normalizeRubricWeights(rubric.criteria),
    reviewPrompt: rubric.reviewPrompt,
    passThreshold: rubric.passThreshold,
  };
}

/**
 * The weighted total, computed here rather than read from the model.
 *
 * Qonvo's prompt asks the model to work out `Σ(score × weight / 100)` itself. Language models are
 * unreliable at exactly this — multi-term weighted arithmetic — and the number is not a suggestion:
 * it becomes a grade in a customer's LMS. So the model scores each criterion, which is a judgement,
 * and we do the arithmetic, which is not.
 *
 * Unscored criteria are excluded and the remaining weights are re-normalised, so a review that lost
 * one criterion is scored on what it actually judged instead of being silently marked down for the
 * missing one. Returns 0 when nothing was scored at all.
 */
export function computeWeightedScore(criteria: ScoredCriterion[]): number {
  const scored = criteria.filter(
    (criterion): criterion is ScoredCriterion & { score: number } => criterion.score !== null,
  );
  if (scored.length === 0) {
    return 0;
  }

  const weightSum = scored.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (weightSum <= 0) {
    const mean = scored.reduce((sum, criterion) => sum + criterion.score, 0) / scored.length;
    return roundToOneDecimal(mean);
  }

  const total = scored.reduce((sum, criterion) => sum + criterion.score * criterion.weight, 0);
  return roundToOneDecimal(total / weightSum);
}

/** A participant passes when the computed total reaches the authored mark. */
export function didPass(weightedScore: number, passThreshold: number): boolean {
  return weightedScore >= passThreshold;
}
