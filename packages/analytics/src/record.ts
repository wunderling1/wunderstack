import { eq, interactionEvents, withFundSchema } from "@wunderstack/db";
import { env } from "@wunderstack/shared";

import { interactionEventInputSchema, type InteractionEventInput } from "./event";

/**
 * Write one interaction event to the fund schema. Best-effort: no DATABASE_URL → `{ recorded: false }`.
 * A DB error is left to the caller — never break an answer that was already streamed.
 * Writes only through `withFundSchema`. There is no public dual-write.
 */

export interface RecordEventResult {
  recorded: boolean;
}

export async function recordInteractionEvent(
  input: InteractionEventInput,
): Promise<RecordEventResult> {
  if (!env.DATABASE_URL) {
    return { recorded: false };
  }

  const event = interactionEventInputSchema.parse(input);
  const values = {
    tenantId: event.tenantId,
    agentId: event.agentId,
    fund: event.fund,
    sessionId: event.sessionId,
    userId: event.userId ?? null,
    traceId: event.traceId ?? null,
    outcome: event.turnOutcome.outcome,
    outcomeReason: event.turnOutcome.outcomeReason,
    citationCount: event.citationCount,
    retrievedCount: event.retrievedCount,
    topScore: event.topScore,
    question: event.question ?? null,
    theme: event.theme ?? null,
    channel: event.channel ?? null,
  };
  await withFundSchema(event.fund, (tx) => tx.insert(interactionEvents).values(values));
  return { recorded: true };
}

/** A user feedback signal on a prior answer. */
export type FeedbackSignal = "up" | "down";

/**
 * Attach a feedback signal to the event(s) of a Langfuse trace (matched on `traceId`).
 * `fundKey` is required — there is no public corpus table to update.
 */
export async function attachFeedbackByTrace(
  traceId: string,
  signal: FeedbackSignal,
  fundKey?: string,
): Promise<RecordEventResult> {
  if (!env.DATABASE_URL || !fundKey) {
    return { recorded: false };
  }
  await withFundSchema(fundKey, (tx) =>
    tx.update(interactionEvents).set({ feedback: signal }).where(eq(interactionEvents.traceId, traceId)),
  );
  return { recorded: true };
}
