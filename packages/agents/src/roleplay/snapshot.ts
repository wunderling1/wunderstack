import { roleplayDifficultySchema, roleplayDifficultyPromptsSchema } from "@wunderstack/shared";
import { z } from "zod";

/**
 * The frozen scenario a session runs on.
 *
 * A scenario is editable and archivable configuration; a session is a record of what actually
 * happened. Reading the live scenario on every turn would let an edit halfway through a conversation
 * change the persona under the learner's feet, and would make a finished session unreproducible —
 * the reviewer would judge a transcript against text that was never used to produce it. So the
 * scenario is resolved once, at start, and written to `roleplay_sessions.scenario_snapshot`. Every
 * later turn and the review read the snapshot.
 *
 * Existing snapshots are never rewritten. They record what the model received, not what we would
 * send today (EU AI Act Art. 12).
 *
 * The schema is authoritative and the TypeScript types are inferred from it. A jsonb column read
 * back into a typed object without parsing is an unchecked cast, and this particular object decides
 * what a model is told to be.
 */

const weightedCriterionSchema = z
  .object({
    question: z.string().min(1).max(500),
    description: z.string().max(2000),
    behavioralIndicators: z.array(z.string().min(1).max(500)).max(20),
    /** Percentage, 0-100. The set sums to 100 (see `normalizeRubricWeights`). */
    weight: z.number().min(0).max(100),
  })
  .strict();

const resolvedRubricSchema = z
  .object({
    criteria: z.array(weightedCriterionSchema).min(1).max(12),
    reviewPrompt: z.string().max(4000),
    passThreshold: z.number().min(0).max(10),
  })
  .strict();

/**
 * Everything the model may know. `briefing` is absent by construction — it is the learner's
 * preparation text, and a persona that reads it starts steering toward the lesson instead of playing
 * its part. The display half of the snapshot carries it instead.
 */
export const roleplayScenarioPromptSchema = z
  .object({
    partnerRole: z.string().min(1).max(500),
    userRole: z.string().min(1).max(500),
    userTitle: z.string().max(200),
    persona: z.string().max(8000),
    contextDescription: z.string().max(8000),
    hiddenInformation: z.string().max(8000),
    learningObjective: z.string().max(4000),
    secondaryObjective: z.string().max(4000),
    commonPitfalls: z.array(z.string().min(1).max(1000)).max(20),
    instructions: z.string().max(8000),
    openingLine: z.string().max(2000),
    endCondition: z.string().max(2000),
    rubric: resolvedRubricSchema,
    difficulty: roleplayDifficultyPromptsSchema.optional(),
  })
  .strict();

/** What the learner sees. Kept in a separate branch so it cannot be handed to a prompt builder. */
export const roleplayScenarioDisplaySchema = z
  .object({
    title: z.string().min(1).max(500),
    briefing: z.string().max(8000),
  })
  .strict();

export const roleplayScenarioSnapshotSchema = z
  .object({
    slug: z.string().min(1).max(200),
    /** Scenario version at start. The human-readable handle for this frozen text. */
    version: z.number().int().positive(),
    /** Null when the scenario authored no modulation for the requested level. */
    difficulty: roleplayDifficultySchema.nullable(),
    prompt: roleplayScenarioPromptSchema,
    display: roleplayScenarioDisplaySchema,
  })
  .strict();

export type RoleplayScenarioSnapshot = z.infer<typeof roleplayScenarioSnapshotSchema>;
export type RoleplayScenarioDisplay = z.infer<typeof roleplayScenarioDisplaySchema>;

/**
 * Parse a stored snapshot. Throws on anything that is not a valid snapshot rather than handing a
 * half-shaped object to the prompt builder, where a missing `partnerRole` would become the string
 * "undefined" in a system prompt.
 */
export function parseScenarioSnapshot(value: unknown): RoleplayScenarioSnapshot {
  return roleplayScenarioSnapshotSchema.parse(value);
}
