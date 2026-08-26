import { z } from "zod";

import { roleplayDifficultySchema, roleplayEndReasonSchema, roleplayExternalRefSchema, roleplayOriginSchema, roleplayWebhookTargetSchema } from "./roleplay-scenario.js";

/**
 * Roleplay API contract: the three requests, the NDJSON turn stream, and the review shape.
 *
 * Deliberately NOT `chatEventSchema`. That union's `citations` event carries `found`, `citations[]`
 * and `citationVerificationFailed` — the G4 grounding guarantee of the CAO product. A roleplay turn
 * has nothing truthful to put in those fields, and filling them with placeholders would make the
 * strongest promise in the codebase mean nothing (DECISION-roleplay-agent.md, R5). Same NDJSON
 * shape, same perimeter, different events.
 */

/* ----------------------------------------------------------------- criterion */

/**
 * One scored criterion. The single source of truth for this shape: the reviewer produces it
 * (`@wunderstack/agents`), the fund schema stores it as jsonb, and the API returns it.
 *
 * `weight` is a PERCENTAGE, not the 1-5 importance rating the author typed. The rating is an input
 * to weighting; the percentage is what the score was actually computed from, and storing it is what
 * lets a stored review be re-derived — and audited — from its own row.
 *
 * `score` is nullable because "the model did not score this criterion" is a real outcome that must
 * not be recorded as a zero. `computeWeightedScore` excludes such a criterion and re-normalises the
 * rest, so a null here means "not judged", never "judged badly".
 */
export const roleplayCriterionScoreSchema = z
  .object({
    question: z.string().min(1).max(500),
    feedback: z.string().max(8000),
    score: z.number().min(0).max(10).nullable(),
    weight: z.number().min(0).max(100),
  })
  .strict();

export type RoleplayCriterionScore = z.infer<typeof roleplayCriterionScoreSchema>;

/* --------------------------------------------------------------------- start */

export const roleplayStartRequestSchema = z
  .object({
    scenarioSlug: z.string().min(1).max(200),
    /** Absent means the scenario's unmodulated baseline; an unknown level is rejected, not ignored. */
    difficulty: roleplayDifficultySchema.optional(),
    /** Fund key. Bound against the resolved instance server-side; never trusted as given. */
    fund: z.string().min(1).max(200).optional(),
    /**
     * How this session was launched. Omitted = embed (the leerling-UI). `webhook` requires a
     * `resultTarget`. `lti11` is set by the launch route from a verified token, never by this
     * body — a client that claims it is spoofing. `lti13` waits for Fase 9.
     */
    origin: roleplayOriginSchema.optional(),
    /** Delivery target, snapshotted onto the session. Required for `origin: "webhook"`. */
    resultTarget: roleplayWebhookTargetSchema.optional(),
    /** Opaque platform pseudonym. Never a name or email (R3). */
    externalUserRef: roleplayExternalRefSchema.optional(),
    externalContextRef: roleplayExternalRefSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const origin = value.origin ?? "embed";
    if (origin === "lti11" || origin === "lti13") {
      ctx.addIssue({
        code: "custom",
        path: ["origin"],
        message: "LTI origin is set by the launch, not by the client.",
      });
    }
    if (origin === "embed" && value.resultTarget !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["resultTarget"],
        message: "An embed session has no delivery target.",
      });
    }
    if (origin === "webhook" && value.resultTarget === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["resultTarget"],
        message: "A webhook session needs a resultTarget.",
      });
    }
  });

export type RoleplayStartRequest = z.infer<typeof roleplayStartRequestSchema>;

export const roleplayStartResponseSchema = z
  .object({
    sessionId: z.string().uuid(),
    /** Scenario title and preparation text for the learner. The persona never sees the briefing. */
    title: z.string(),
    briefing: z.string(),
    /** The persona's first line, already stored as the opening transcript message. */
    opening: z.string(),
    /** Labels the UI needs to render the transcript without a second request. */
    partnerRole: z.string(),
    userTitle: z.string(),
    turnsUsed: z.number().int().nonnegative(),
    maxTurns: z.number().int().positive(),
  })
  .strict();

export type RoleplayStartResponse = z.infer<typeof roleplayStartResponseSchema>;

/* ---------------------------------------------------------------------- turn */

export const roleplayTurnRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    message: z.string().min(1, "Typ een bericht.").max(4000, "Bericht is te lang."),
  })
  .strict();

export type RoleplayTurnRequest = z.infer<typeof roleplayTurnRequestSchema>;

/**
 * Progress phases. One entry today because a roleplay turn has no retrieval step to report — the
 * enum exists so the client's phase handling and the event shape survive turn-based voice adding
 * `transcribing` and `synthesizing` (Fase 10) without a contract change.
 */
export const roleplayStatusPhases = ["generating"] as const;

export type RoleplayStatusPhase = (typeof roleplayStatusPhases)[number];

export const roleplayEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), phase: z.enum(roleplayStatusPhases) }),
  z.object({ type: z.literal("text"), delta: z.string() }),
  /**
   * The turn's terminal metadata, and the roleplay counterpart of chat's `citations` event: the
   * point at which the client learns what the turn actually was.
   *
   * `turnsUsed`/`maxTurns` come from the atomic counter, not from client arithmetic — two tabs
   * posting at once must not disagree about how many turns are left. `endReason` is null while the
   * conversation continues.
   */
  z.object({
    type: z.literal("turn"),
    reply: z.string(),
    conversationEnd: z.boolean(),
    turnsUsed: z.number().int().nonnegative(),
    maxTurns: z.number().int().positive(),
    endReason: roleplayEndReasonSchema.nullable(),
  }),
  z.object({
    type: z.literal("done"),
    usage: z.object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
    }),
    traceId: z.string().nullable(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type RoleplayEvent = z.infer<typeof roleplayEventSchema>;

/* -------------------------------------------------------------------- review */

export const roleplayReviewRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    /**
     * How the learner says the conversation ended. Only honoured for a session that is still
     * active — a session the persona already closed keeps the reason it closed with, so a client
     * cannot relabel a completed conversation as abandoned to soften its review.
     */
    endReason: roleplayEndReasonSchema.optional(),
  })
  .strict();

export type RoleplayReviewRequest = z.infer<typeof roleplayReviewRequestSchema>;

/**
 * What the client is shown. Named `…Payload` rather than `RoleplayReview` because that name is
 * already the stored row in `@wunderstack/db`, and a route that imports both should not have to
 * disambiguate two different shapes with one name.
 */
export const roleplayReviewPayloadSchema = z
  .object({
    criteria: z.array(roleplayCriterionScoreSchema),
    weightedScore: z.number().min(0).max(10),
    passed: z.boolean(),
    /** Echoed so the client can show "6,0 van de 5,5" without refetching the scenario. */
    passThreshold: z.number().min(0).max(10),
    feedbackSummary: z.string(),
  })
  .strict();

export type RoleplayReviewPayload = z.infer<typeof roleplayReviewPayloadSchema>;

/**
 * A review is either finished or still running. `pending` is a normal answer, not an error: the
 * judgement takes up to two minutes and the client polls (Fase 7 replaces polling with delivery).
 */
export const roleplayReviewResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("ready"), review: roleplayReviewPayloadSchema }),
]);

export type RoleplayReviewResponse = z.infer<typeof roleplayReviewResponseSchema>;
