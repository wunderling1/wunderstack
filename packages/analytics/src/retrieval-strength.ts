/**
 * Derive retrieval strength from raw signals stored on `interaction_events`.
 *
 * Thresholds are platform constants calibrated once — not per-fund config. Persisting the label
 * would freeze history across recalibrations; store `retrieved_count` + `top_score` instead.
 */

/** Platform constant: top similarity at or above this is "strong" (above the default minScore floor of 0.48). */
export const RETRIEVAL_STRONG_MIN_SCORE = 0.6;

export type RetrievalStrength = "none" | "weak" | "strong";

export function deriveRetrievalStrength(
  retrievedCount: number,
  topScore: number | null,
): RetrievalStrength {
  if (retrievedCount === 0) {
    return "none";
  }
  if (topScore === null || topScore < RETRIEVAL_STRONG_MIN_SCORE) {
    return "weak";
  }
  return "strong";
}
