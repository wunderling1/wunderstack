import { eq, getDb, interactionEvents, publicCorpusExists, withFundSchema } from "@wunderstack/db";
import { env } from "@wunderstack/shared";

import { interactionEventInputSchema, type InteractionEventInput } from "./event.js";

/**
 * Write one interaction event to the fund database (Fase 1). Best-effort by contract: when no
 * DATABASE_URL is configured (e.g. the local demo without a DB) it returns `{ recorded: false }`
 * instead of throwing, mirroring how the codebase treats optional infrastructure. A DB error is left
 * to the caller to catch — the caller must never let it break the answer that was already streamed.
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
    outcome: event.outcome,
    citationCount: event.citationCount,
    question: event.question ?? null,
    theme: event.theme ?? null,
    channel: event.channel ?? null,
  };
  await withFundSchema(event.fund, (tx) => tx.insert(interactionEvents).values(values));
  // Dual-write while public corpus tables still exist (commit 1). Dropped in the operator script.
  if (await publicCorpusExists()) {
    await getDb().insert(interactionEvents).values(values);
  }
  return { recorded: true };
}

/** A user feedback signal on a prior answer. */
export type FeedbackSignal = "up" | "down";

/**
 * Attach a feedback signal to the event(s) of a Langfuse trace (matched on `traceId`). Called by the
 * feedback endpoint so the durable log carries the signal too, not only Langfuse. Best-effort: no DB
 * configured → `{ recorded: false }`. After public corpus tables are dropped, `fundKey` is required.
 */
export async function attachFeedbackByTrace(
  traceId: string,
  signal: FeedbackSignal,
  fundKey?: string,
): Promise<RecordEventResult> {
  if (!env.DATABASE_URL) {
    return { recorded: false };
  }
  if (fundKey) {
    await withFundSchema(fundKey, (tx) =>
      tx.update(interactionEvents).set({ feedback: signal }).where(eq(interactionEvents.traceId, traceId)),
    );
  }
  if (await publicCorpusExists()) {
    await getDb()
      .update(interactionEvents)
      .set({ feedback: signal })
      .where(eq(interactionEvents.traceId, traceId));
  }
  return { recorded: true };
}
