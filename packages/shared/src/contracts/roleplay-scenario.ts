import { z } from "zod";

/**
 * Roleplay scenario content — the jsonb payloads on `control.roleplay_scenarios` and the shape the
 * authoring form parses. Scalar scenario fields are real columns; only the two nested structures
 * (rubric, per-difficulty prompt overrides) live as jsonb.
 *
 * Flat by design (DECISION-roleplay-agent.md, R2): no reusable building blocks, no per-scenario
 * overrides, no visibility levels. One fund per runtime does not need that indirection yet.
 */

/** Difficulty levels. English identifiers; the Dutch label is data, not an identifier. */
export const ROLEPLAY_DIFFICULTIES = ["basic", "advanced", "expert"] as const;

export type RoleplayDifficulty = (typeof ROLEPLAY_DIFFICULTIES)[number];

export const roleplayDifficultySchema = z.enum(ROLEPLAY_DIFFICULTIES);

export const ROLEPLAY_DIFFICULTY_LABELS: Record<RoleplayDifficulty, string> = {
  basic: "Basis",
  advanced: "Gevorderd",
  expert: "Expert",
};

/**
 * One rubric criterion. `weight` is a 1-5 importance rating, not a percentage: weights are
 * normalised to a 100% distribution at scoring time so an author can add a criterion without
 * rebalancing every other one by hand.
 */
export const rubricCriterionSchema = z
  .object({
    question: z.string().min(1).max(500),
    description: z.string().max(2000).default(""),
    weight: z.number().int().min(1).max(5).default(3),
    behavioralIndicators: z.array(z.string().min(1).max(500)).max(20).default([]),
  })
  .strict();

export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

/**
 * The rubric the reviewer scores against. `passThreshold` is on the same 0-10 scale the reviewer
 * reports per criterion; the weighted total is recomputed in code and never taken from the model.
 */
export const roleplayRubricSchema = z
  .object({
    criteria: z.array(rubricCriterionSchema).min(1).max(12),
    reviewPrompt: z.string().max(4000).default(""),
    passThreshold: z.number().min(0).max(10).default(5.5),
  })
  .strict();

export type RoleplayRubric = z.infer<typeof roleplayRubricSchema>;

/**
 * Optional per-difficulty prompt additions. Absent levels simply get no modulation, so a scenario
 * is playable without any difficulty content at all.
 */
export const roleplayDifficultyPromptsSchema = z
  .object({
    conversationPrompt: z.string().max(2000).default(""),
    reviewPrompt: z.string().max(2000).default(""),
  })
  .strict();

export type RoleplayDifficultyPrompts = z.infer<typeof roleplayDifficultyPromptsSchema>;

/** `partialRecord`, not `record`: `z.record` over an enum demands every level be present. */
export const roleplayDifficultyMapSchema = z.partialRecord(
  roleplayDifficultySchema,
  roleplayDifficultyPromptsSchema,
);

export type RoleplayDifficultyMap = z.infer<typeof roleplayDifficultyMapSchema>;

/** Lifecycle of an authored scenario. Only `published` scenarios can start a session. */
export const ROLEPLAY_SCENARIO_STATUSES = ["draft", "published", "archived"] as const;

export type RoleplayScenarioStatus = (typeof ROLEPLAY_SCENARIO_STATUSES)[number];

export const roleplayScenarioStatusSchema = z.enum(ROLEPLAY_SCENARIO_STATUSES);

export const ROLEPLAY_SCENARIO_STATUS_LABELS: Record<RoleplayScenarioStatus, string> = {
  draft: "Concept",
  published: "Gepubliceerd",
  archived: "Gearchiveerd",
};

/**
 * URL-safe slug, same alphabet as a fund key: lowercase alphanumeric segments joined by hyphens.
 * Immutable after create — it is the row's primary key alongside fund_key.
 */
export const roleplayScenarioSlugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Gebruik alleen kleine letters, cijfers en koppeltekens.",
  );

/**
 * Draft-tolerant criterion: an unfinished question is allowed so an author can save a half-built
 * rubric. Publication checks require a non-empty question; the runtime schema (`rubricCriterionSchema`)
 * still rejects empty questions on a published snapshot.
 */
export const rubricCriterionDraftSchema = z
  .object({
    question: z.string().max(500),
    description: z.string().max(2000).default(""),
    weight: z.number().int().min(1).max(5).default(3),
    behavioralIndicators: z.array(z.string().max(500)).max(20).default([]),
  })
  .strict();

export type RubricCriterionDraft = z.infer<typeof rubricCriterionDraftSchema>;

export const roleplayRubricDraftSchema = z
  .object({
    criteria: z.array(rubricCriterionDraftSchema).min(1).max(12),
    reviewPrompt: z.string().max(4000).default(""),
    passThreshold: z.number().min(0).max(10).default(5.5),
  })
  .strict();

export type RoleplayRubricDraft = z.infer<typeof roleplayRubricDraftSchema>;

/**
 * Writable scenario body. Empty strings are allowed so a draft can be saved incomplete;
 * `publicationIssues` decides whether `status = published` is legal. Slug is not in this object:
 * it is the identity of the row, not content, and is immutable after create.
 */
export const roleplayScenarioDraftSchema = z
  .object({
    title: z.string().max(500),
    description: z.string().max(2000),
    partnerRole: z.string().max(500),
    userRole: z.string().max(500),
    userTitle: z.string().max(200),
    persona: z.string().max(8000),
    contextDescription: z.string().max(8000),
    hiddenInformation: z.string().max(8000),
    learningObjective: z.string().max(4000),
    secondaryObjective: z.string().max(4000),
    commonPitfalls: z.array(z.string().max(1000)).max(20),
    instructions: z.string().max(8000),
    openingLine: z.string().max(2000),
    endCondition: z.string().max(2000),
    maxTurns: z.number().int().min(1).max(100),
    briefing: z.string().max(8000),
    rubric: roleplayRubricDraftSchema,
    difficulties: roleplayDifficultyMapSchema,
    status: roleplayScenarioStatusSchema,
  })
  .strict();

export type RoleplayScenarioDraft = z.infer<typeof roleplayScenarioDraftSchema>;

export function emptyRoleplayScenarioDraft(): RoleplayScenarioDraft {
  return {
    title: "",
    description: "",
    partnerRole: "",
    userRole: "",
    userTitle: "",
    persona: "",
    contextDescription: "",
    hiddenInformation: "",
    learningObjective: "",
    secondaryObjective: "",
    commonPitfalls: [],
    instructions: "",
    openingLine: "",
    endCondition: "",
    maxTurns: 12,
    briefing: "",
    rubric: {
      criteria: [{ question: "", description: "", weight: 3, behavioralIndicators: [] }],
      reviewPrompt: "",
      passThreshold: 5.5,
    },
    difficulties: {},
    status: "draft",
  };
}

/** Where a session came from. Drives which delivery adapter handles its result. */
export const ROLEPLAY_ORIGINS = ["embed", "webhook", "lti11", "lti13"] as const;

export type RoleplayOrigin = (typeof ROLEPLAY_ORIGINS)[number];

export const roleplayOriginSchema = z.enum(ROLEPLAY_ORIGINS);

/**
 * Opaque platform identifier: a pseudonym, never a name or an email (R3). The `@` check is the
 * cheap mechanical half of "no e-mail-autolink"; a look-up that would join this to an identity
 * table is the other half, and is simply not built.
 */
export const roleplayExternalRefSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !value.includes("@"), "Must be a pseudonym, not an email address.");

/**
 * Where a session's result must be POSTed. Snapshotted onto the session at start and copied onto
 * the outbox row at enqueue, so an edit to the caller's config cannot retarget a conversation that
 * already ran.
 *
 * Discriminated on `kind`. Webhook (Fase 7) and LTI 1.1 Basic Outcomes (Fase 8) share one outbox;
 * LTI 1.3 is a later adapter on the same seam. The HTTP start body still only accepts webhook —
 * an `lti11` target is set by the launch route from the signed LMS request, never by the client.
 */
export const roleplayWebhookTargetSchema = z
  .object({
    kind: z.literal("webhook"),
    /** HTTPS URL we will POST the result envelope to. Validated for SSRF at start and again at delivery. */
    url: z.url().max(2000),
  })
  .strict();

export type RoleplayWebhookTarget = z.infer<typeof roleplayWebhookTargetSchema>;

/**
 * LTI 1.1 Basic Outcomes target. The consumer secret is looked up at delivery time, not snapshotted:
 * rotating the secret must still reach grades that were queued against the previous launch.
 */
export const roleplayLti11TargetSchema = z
  .object({
    kind: z.literal("lti11"),
    consumerId: z.string().uuid(),
    outcomeServiceUrl: z.url().max(2000),
    resultSourcedId: z.string().min(1).max(2000),
  })
  .strict();

export type RoleplayLti11Target = z.infer<typeof roleplayLti11TargetSchema>;

export const roleplayResultTargetSchema = z.discriminatedUnion("kind", [
  roleplayWebhookTargetSchema,
  roleplayLti11TargetSchema,
]);

export type RoleplayResultTarget = z.infer<typeof roleplayResultTargetSchema>;

/**
 * Why a session stopped. The reviewer prompt reads this: a conversation that ran out of turns is
 * judged differently from one the learner closed on purpose.
 */
export const ROLEPLAY_END_REASONS = ["completed", "max_turns_reached", "abandoned"] as const;

export type RoleplayEndReason = (typeof ROLEPLAY_END_REASONS)[number];

export const roleplayEndReasonSchema = z.enum(ROLEPLAY_END_REASONS);

export const ROLEPLAY_SESSION_STATUSES = ["active", "ended"] as const;

export type RoleplaySessionStatus = (typeof ROLEPLAY_SESSION_STATUSES)[number];

export const roleplaySessionStatusSchema = z.enum(ROLEPLAY_SESSION_STATUSES);

export const ROLEPLAY_DELIVERY_STATUSES = ["pending", "delivered", "failed"] as const;

export type RoleplayDeliveryStatus = (typeof ROLEPLAY_DELIVERY_STATUSES)[number];

export const roleplayDeliveryStatusSchema = z.enum(ROLEPLAY_DELIVERY_STATUSES);
