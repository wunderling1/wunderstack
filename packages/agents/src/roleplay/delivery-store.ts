import {
  and,
  eq,
  lte,
  roleplayResultDeliveries,
  roleplayReviews,
  roleplaySessions,
  withFundSchema,
} from "@wunderstack/db";
import {
  buildRoleplayResultEnvelope,
  roleplayEndReasonSchema,
  roleplayOriginSchema,
  roleplayResultTargetSchema,
  type RoleplayResultEnvelope,
  type RoleplayResultTarget,
} from "@wunderstack/shared";

import { parseScenarioSnapshot } from "./snapshot";

/**
 * Outbox for roleplay results (Fase 7, R4).
 *
 * The unique index on `session_id` is the dedup: a retried or re-run review cannot enqueue a second
 * grade. `nextAttemptAt` is the backoff, so a failed POST retries without a queue product. Processing
 * is opportunistic (after a review, and on start) because Inngest/Temporal are out of v1 — a due row
 * waits until the next such call, which for a live fund is seconds, not hours.
 */

export const ROLEPLAY_DELIVERY_MAX_ATTEMPTS = 5;

const CLAIM_BATCH = 10;

/** Backoff after this attempt: 30s, 2m, 8m, 32m. The fifth failure is terminal. */
export function nextDeliveryAttemptAt(attempts: number, now = new Date()): Date {
  const delayMs = 30_000 * 4 ** Math.max(0, attempts - 1);
  return new Date(now.getTime() + delayMs);
}

export interface ClaimedDelivery {
  id: string;
  sessionId: string;
  attempts: number;
  target: RoleplayResultTarget;
  envelope: RoleplayResultEnvelope;
}

/**
 * Copy the session's `resultTarget` onto a pending outbox row. No-op when the session has none
 * (embed origin) or when a row already exists (the unique index). Never throws: enqueueing is not
 * allowed to undo a review that already landed.
 */
export async function enqueueResultDelivery(fund: string, sessionId: string): Promise<void> {
  try {
    await withFundSchema(fund, async (tx) => {
      const [session] = await tx
        .select({ resultTarget: roleplaySessions.resultTarget })
        .from(roleplaySessions)
        .where(eq(roleplaySessions.id, sessionId))
        .limit(1);
      if (!session?.resultTarget) {
        return;
      }
      const target = roleplayResultTargetSchema.safeParse(session.resultTarget);
      if (!target.success) {
        return;
      }
      await tx
        .insert(roleplayResultDeliveries)
        .values({ sessionId, target: target.data })
        .onConflictDoNothing({ target: roleplayResultDeliveries.sessionId });
    });
  } catch (error) {
    console.error("[roleplay-delivery] enqueue failed:", error);
  }
}

/**
 * Lock a batch of due pending rows, bump their attempt counter and backoff, and return them with
 * a freshly built envelope. The HTTP POST happens outside this transaction so a slow customer
 * cannot hold the row lock.
 */
export async function claimDueDeliveries(
  fund: string,
  now = new Date(),
): Promise<ClaimedDelivery[]> {
  return withFundSchema(fund, async (tx) => {
    const rows = await tx
      .select()
      .from(roleplayResultDeliveries)
      .where(
        and(
          eq(roleplayResultDeliveries.status, "pending"),
          lte(roleplayResultDeliveries.nextAttemptAt, now),
        ),
      )
      .orderBy(roleplayResultDeliveries.nextAttemptAt)
      .limit(CLAIM_BATCH)
      .for("update", { skipLocked: true });

    const claimed: ClaimedDelivery[] = [];
    for (const row of rows) {
      const attempts = row.attempts + 1;
      await tx
        .update(roleplayResultDeliveries)
        .set({
          attempts,
          nextAttemptAt:
            attempts >= ROLEPLAY_DELIVERY_MAX_ATTEMPTS
              ? row.nextAttemptAt
              : nextDeliveryAttemptAt(attempts, now),
        })
        .where(eq(roleplayResultDeliveries.id, row.id));

      const built = await loadEnvelope(tx, fund, row.sessionId, row.target);
      if (!built) {
        await tx
          .update(roleplayResultDeliveries)
          .set({
            status: "failed",
            lastError: "session or review missing; cannot build envelope",
          })
          .where(eq(roleplayResultDeliveries.id, row.id));
        continue;
      }
      claimed.push({
        id: row.id,
        sessionId: row.sessionId,
        attempts,
        ...built,
      });
    }
    return claimed;
  });
}

export async function markDeliveryDelivered(fund: string, deliveryId: string): Promise<void> {
  await withFundSchema(fund, (tx) =>
    tx
      .update(roleplayResultDeliveries)
      .set({ status: "delivered", deliveredAt: new Date(), lastError: null })
      .where(eq(roleplayResultDeliveries.id, deliveryId)),
  );
}

export async function markDeliveryFailed(
  fund: string,
  deliveryId: string,
  attempts: number,
  error: string,
): Promise<void> {
  const terminal = attempts >= ROLEPLAY_DELIVERY_MAX_ATTEMPTS;
  await withFundSchema(fund, (tx) =>
    tx
      .update(roleplayResultDeliveries)
      .set({
        lastError: error.slice(0, 2000),
        ...(terminal ? { status: "failed" as const } : {}),
      })
      .where(eq(roleplayResultDeliveries.id, deliveryId)),
  );
}

type FundTx = Parameters<Parameters<typeof withFundSchema>[1]>[0];

async function loadEnvelope(
  tx: FundTx,
  fund: string,
  sessionId: string,
  rawTarget: Record<string, unknown>,
): Promise<{ target: RoleplayResultTarget; envelope: RoleplayResultEnvelope } | null> {
  const target = roleplayResultTargetSchema.safeParse(rawTarget);
  if (!target.success) {
    return null;
  }

  const [session] = await tx
    .select()
    .from(roleplaySessions)
    .where(eq(roleplaySessions.id, sessionId))
    .limit(1);
  const [review] = await tx
    .select()
    .from(roleplayReviews)
    .where(eq(roleplayReviews.sessionId, sessionId))
    .limit(1);
  if (!session || !review) {
    return null;
  }

  const origin = roleplayOriginSchema.safeParse(session.origin);
  const endReason = roleplayEndReasonSchema.safeParse(session.endReason);
  if (!origin.success || !endReason.success) {
    return null;
  }

  let snapshot;
  try {
    snapshot = parseScenarioSnapshot(session.scenarioSnapshot);
  } catch {
    return null;
  }
  return {
    target: target.data,
    envelope: buildRoleplayResultEnvelope({
      fund,
      sessionId,
      scenarioSlug: session.scenarioSlug,
      scenarioVersion: session.scenarioVersion,
      origin: origin.data,
      externalUserRef: session.externalUserRef,
      externalContextRef: session.externalContextRef,
      endReason: endReason.data,
      turnsUsed: session.turnsUsed,
      maxTurns: session.maxTurns,
      weightedScore: review.weightedScore,
      passed: review.passed,
      passThreshold: snapshot.prompt.rubric.passThreshold,
      feedbackSummary: review.feedbackSummary,
      criteria: review.criterionScores,
    }),
  };
}
