import { z } from "zod";

/**
 * Feedback API contract, shared by the route handler and the chat client. A thumbs up/down (plus an
 * optional reason) that gets scored onto the answer's Langfuse trace (Fase 12 feedback loop).
 */

export const feedbackRequestSchema = z.object({
  /** The answer's Langfuse trace id (from the chat stream's `done` event). */
  traceId: z.string().min(1).max(200),
  /** "up" = helpful, "down" = not helpful. */
  rating: z.enum(["up", "down"]),
  /** Optional free-text reason (most useful on a thumbs down). */
  reason: z.string().max(2000).optional(),
});

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;
