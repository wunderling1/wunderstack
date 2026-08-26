import { z } from "zod";

import type { ScoredCriterion, WeightedCriterion } from "./types.js";

/**
 * What the model is asked to emit, and how we survive it not quite doing so.
 *
 * The prompts ask for raw JSON. Models wrap it in a fenced block, prefix it with a sentence, or
 * reorder the criteria anyway — so parsing is tolerant and normalisation is authoritative. The
 * schemas here describe the model's output; `types.ts` describes ours.
 */

export const roleplayTurnOutputSchema = z.object({
  text: z.string(),
  conversationEnd: z.boolean(),
});

export type RoleplayTurnOutput = z.infer<typeof roleplayTurnOutputSchema>;

export const roleplayOpeningOutputSchema = z.object({
  text: z.string(),
});

export type RoleplayOpeningOutput = z.infer<typeof roleplayOpeningOutputSchema>;

/**
 * Score is deliberately NOT bounded to 0-10 here. `toScore` clamps instead of rejecting: a model
 * that answers 11 has made a rounding mistake, not produced an unusable review, and failing the
 * whole review over it would throw away the other nine criteria. Same reasoning as Qonvo's
 * `Normalize Review Output` node.
 */
export const reviewFeedbackItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
  score: z.number().optional(),
});

export const reviewScoreItemSchema = z.object({
  criterion: z.string(),
  score: z.number(),
});

export const roleplayReviewOutputSchema = z.object({
  feedback: z.array(reviewFeedbackItemSchema),
  feedbackSummary: z.string(),
  isPassed: z.boolean(),
  scores: z.array(reviewScoreItemSchema).optional(),
});

export type RoleplayReviewOutput = z.infer<typeof roleplayReviewOutputSchema>;

/**
 * Pull a JSON object out of a model response.
 *
 * "Genereer ALLEEN de onbewerkte JSON-string" is an instruction, not a guarantee. In practice the
 * response arrives fenced as ```json, or with a friendly preamble, or both. Slicing from the first
 * `{` to the last `}` handles all of those without a dependency, and anything left that is not valid
 * JSON is a genuine failure worth throwing on.
 *
 * We parse ourselves rather than using Mastra's `structuredOutput`: the sovereign model adapter is
 * text-only by design (`model/sovereign-model.ts`), so a structured-output mode would either be
 * ignored or quietly route around our own seam.
 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Roleplay model response contained no JSON object: ${preview(text)}`);
  }
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Roleplay model response was not valid JSON (${String(candidate.length)} chars, ${reason}): ${preview(candidate)}`,
      { cause: error },
    );
  }
}

/**
 * Head AND tail, because the two ways this fails look identical from the front: a response truncated
 * at the token ceiling ends mid-string, a genuinely malformed one does not. The character count is
 * there for the same reason. Diagnostics only — this text is never shown to a learner and never
 * changes what the model saw, so it is outside the `ROLEPLAY_PROMPT_VERSION` bump rule.
 */
function preview(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 300) {
    return trimmed;
  }
  return `${trimmed.slice(0, 200)}… […] …${trimmed.slice(-100)}`;
}

/**
 * Clamp to 0-10 and round to one decimal. Anything that is not a number becomes null — "unscored" —
 * and never zero.
 *
 * The type check before the conversion is load-bearing. Qonvo's version calls `Number(value)`
 * directly, and `Number(null)` is 0, as is `Number("")` and `Number([])`. A criterion the model
 * returned as `"score": null` therefore scored a hard zero instead of dropping out of the average,
 * dragging the participant's grade down for a field the model declined to fill in. Null must survive
 * as null so `computeWeightedScore` can exclude the criterion.
 */
export function toScore(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.min(10, Math.round(parsed * 10) / 10));
}

/**
 * Force the model's review onto the authored rubric.
 *
 * The prompt demands one feedback item per criterion, in order, with the question copied verbatim.
 * Models drop items, reorder them, and paraphrase the question. Rather than trusting that, we walk
 * the authored criteria and pull each one's answer and score out of wherever the model put it:
 * first by position, then by matching the question text case-insensitively, and for scores also via
 * the separate top-level `scores` array.
 *
 * The output therefore always has exactly as many entries as the rubric, in rubric order, with the
 * authored wording — which is what makes the stored review comparable across sessions and what lets
 * the weighted score be computed at all. Ported from Qonvo's `normalizeReviewResponse`.
 */
export function normalizeReviewOutput(
  raw: RoleplayReviewOutput,
  criteria: WeightedCriterion[],
): ScoredCriterion[] {
  const items = raw.feedback;
  const scores = raw.scores ?? [];

  const findFeedbackByQuestion = (question: string) => {
    const target = question.trim().toLowerCase();
    return items.find((item) => item.question.trim().toLowerCase() === target);
  };

  return criteria.map((criterion, index) => {
    const byIndex = items[index];
    const byQuestion = findFeedbackByQuestion(criterion.question);

    const positional = byIndex?.answer.trim() ?? "";
    const matched = byQuestion?.answer.trim() ?? "";
    // Prefer position, but a blank at the right index loses to a real answer found by question text.
    const feedback = positional.length > 0 ? positional : matched;

    const score =
      toScore(byIndex?.score) ??
      toScore(
        scores.find(
          (item) => item.criterion.trim().toLowerCase() === criterion.question.trim().toLowerCase(),
        )?.score,
      ) ??
      toScore(byQuestion?.score);

    return {
      question: criterion.question,
      feedback,
      score,
      weight: criterion.weight,
    };
  });
}
