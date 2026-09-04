import { z } from "zod";

import { roleplayCriterionScoreSchema } from "./roleplay";
import { roleplayEndReasonSchema, roleplayOriginSchema } from "./roleplay-scenario";

/**
 * The body we POST to the customer's system when a review is ready.
 *
 * Narrower than the inbound `webhookEventSchema`: same `type` / `fund` / `occurredAt` / `data`
 * envelope, with `data` typed. The customer's verifier can therefore treat inbound and outbound as
 * one HMAC contract (`timestamp.body`, `x-wunderstack-signature`).
 *
 * The transcript is deliberately absent. A grade in the customer's LMS is an administrative record
 * with their retention; the conversation that produced it stays in our fund schema. `sessionId` is
 * the idempotency key — a retried delivery must not become a second grade.
 */
export const roleplayResultEnvelopeSchema = z
  .object({
    type: z.literal("roleplay.result"),
    fund: z.string().min(1).max(200),
    occurredAt: z.iso.datetime(),
    data: z
      .object({
        sessionId: z.string().uuid(),
        scenarioSlug: z.string().min(1).max(200),
        scenarioVersion: z.number().int().positive(),
        origin: roleplayOriginSchema,
        externalUserRef: z.string().max(200).nullable(),
        externalContextRef: z.string().max(200).nullable(),
        endReason: roleplayEndReasonSchema,
        turnsUsed: z.number().int().nonnegative(),
        maxTurns: z.number().int().positive(),
        /** 0–10, recomputed in code from the criterion scores, never taken from the model. */
        weightedScore: z.number().min(0).max(10),
        /** weightedScore / 10. The 0–1 form LTI Basic Outcomes will need in Fase 8. */
        normalizedScore: z.number().min(0).max(1),
        passed: z.boolean(),
        passThreshold: z.number().min(0).max(10),
        feedbackSummary: z.string(),
        criteria: z.array(roleplayCriterionScoreSchema),
      })
      .strict(),
  })
  .strict();

export type RoleplayResultEnvelope = z.infer<typeof roleplayResultEnvelopeSchema>;

export interface BuildRoleplayResultEnvelopeInput {
  fund: string;
  occurredAt?: Date;
  sessionId: string;
  scenarioSlug: string;
  scenarioVersion: number;
  origin: RoleplayResultEnvelope["data"]["origin"];
  externalUserRef: string | null;
  externalContextRef: string | null;
  endReason: RoleplayResultEnvelope["data"]["endReason"];
  turnsUsed: number;
  maxTurns: number;
  weightedScore: number;
  passed: boolean;
  passThreshold: number;
  feedbackSummary: string;
  criteria: RoleplayResultEnvelope["data"]["criteria"];
}

/** Assemble and validate the envelope. The outbox stores the target, not this body — it is rebuilt at send. */
export function buildRoleplayResultEnvelope(
  input: BuildRoleplayResultEnvelopeInput,
): RoleplayResultEnvelope {
  const weightedScore = roundScore(input.weightedScore);
  return roleplayResultEnvelopeSchema.parse({
    type: "roleplay.result",
    fund: input.fund,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    data: {
      sessionId: input.sessionId,
      scenarioSlug: input.scenarioSlug,
      scenarioVersion: input.scenarioVersion,
      origin: input.origin,
      externalUserRef: input.externalUserRef,
      externalContextRef: input.externalContextRef,
      endReason: input.endReason,
      turnsUsed: input.turnsUsed,
      maxTurns: input.maxTurns,
      weightedScore,
      normalizedScore: roundScore(weightedScore / 10),
      passed: input.passed,
      passThreshold: input.passThreshold,
      feedbackSummary: input.feedbackSummary,
      criteria: input.criteria,
    },
  });
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
