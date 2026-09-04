import {
  claimReview,
  clearReviewClaim,
  createRoleplayAgent,
  loadReview,
  loadTranscript,
  saveReview,
  type RoleplaySessionRecord,
} from "@wunderstack/agents";
import type { RoleplayEndReason, RoleplayReviewPayload } from "@wunderstack/shared";

import { enqueueAndProcessDeliveries } from "./roleplay-delivery";

/**
 * Running and storing the rubric review.
 *
 * The review takes up to two minutes and its result has to survive the learner closing the tab
 * (DECISION-roleplay-agent.md, R4), so the route starts it and returns immediately; the client
 * polls. Fase 7 delivers the stored review to the customer's system via the outbox; polling remains
 * for the embed UI, which has no `resultTarget`.
 *
 * Cross-process races (rolling deploy, accidental scale-out) are closed by `claimReview` on
 * `roleplay_sessions.review_started_at` — first write wins — and by `saveReview` inserting with
 * `ON CONFLICT DO NOTHING` so a late loser cannot overwrite a grade already on the outbox/LMS.
 */

/** Present the stored review to the client, with the threshold it was judged against. */
export function toReviewPayload(
  review: { criteria: RoleplayReviewPayload["criteria"]; weightedScore: number; passed: boolean; feedbackSummary: string },
  passThreshold: number,
): RoleplayReviewPayload {
  return {
    criteria: review.criteria,
    weightedScore: review.weightedScore,
    passed: review.passed,
    passThreshold,
    feedbackSummary: review.feedbackSummary,
  };
}

/**
 * Judge one session and store the result. Safe to call twice: an already-reviewed or currently
 * reviewing session is a no-op.
 *
 * Never throws. It runs detached from the request that triggered it, so a rejection here would be an
 * unhandled promise rather than something a client could act on. A failed review clears the claim
 * so a later POST can retry; the client's next poll simply still says `pending`.
 */
export async function runReview(
  fund: string,
  session: RoleplaySessionRecord,
  endReason: RoleplayEndReason,
): Promise<void> {
  try {
    if (await loadReview(fund, session.id)) {
      return;
    }
    if (!(await claimReview(fund, session.id))) {
      return;
    }
    if (await loadReview(fund, session.id)) {
      return;
    }
    const history = await loadTranscript(fund, session.id);
    const result = await createRoleplayAgent().reviewSession(
      { scenario: session.snapshot.prompt, history, endReason },
      { sessionId: session.id },
    );
    const inserted = await saveReview(fund, session.id, {
      criteria: result.criteria,
      weightedScore: result.weightedScore,
      passed: result.passed,
      feedbackSummary: result.feedbackSummary,
      reviewModel: result.model,
      promptVersion: result.promptVersion,
    });
    if (inserted) {
      await enqueueAndProcessDeliveries(fund, session.id);
    }
  } catch (error) {
    console.error("[api/roleplay/review] review failed:", error);
    try {
      await clearReviewClaim(fund, session.id);
    } catch (clearError) {
      console.error("[api/roleplay/review] clear claim failed:", clearError);
    }
  }
}
