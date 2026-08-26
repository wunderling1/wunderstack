import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { roleplayEndReasonSchema, roleplayRubricSchema } from "@wunderstack/shared";
import { z } from "zod";

import { resolveRubric } from "../roleplay/rubric.js";
import { roleplayScenarioPromptSchema } from "../roleplay/snapshot.js";
import type { RoleplayScenarioPrompt } from "../roleplay/types.js";

/**
 * The roleplay golden set (Fase 6) — fixtures for G1-roleplay-contract, G2-roleplay-persona and
 * G2-roleplay-review.
 *
 * PROVENANCE, stated up front because it bounds what a green gate means: these cases are authored,
 * not harvested. Qonvo shipped no roleplay eval, and the transcript aggregation that would have
 * produced a real golden set never ran (its database was unreachable from this machine). So the set
 * measures whether the persona keeps the rules the prompt gives it — not whether a fund's trainers
 * would agree with the grades. Swap in real transcripts with their original grades the moment a fund
 * has them; that is the only thing that turns the review gate from a stability check into a
 * correctness check.
 *
 * The scenarios are stored the way an AUTHOR writes them (1-5 importance ratings) and resolved here
 * through the production `resolveRubric` + `roleplayScenarioPromptSchema`. A fixture is therefore
 * guaranteed to be a legal snapshot — the same object a real session freezes at start — instead of a
 * hand-balanced set of percentages that only the eval would accept.
 */

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const FIXTURE_FILE = "roleplay-golden-set.json";

const messageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })
  .strict();

/**
 * Whether the persona may disclose the hidden layer on this turn.
 *
 * `forbidden` is a gate: an early reveal empties the exercise, because there is nothing left for the
 * learner to uncover. `allowed` is not the mirror gate — it marks a turn where a targeted,
 * non-judgemental probe has earned the disclosure, and is reported as a trend. A persona that never
 * reveals anything is also broken, but with one probe case in the set that would be a coin flip, not
 * a threshold (see ROLEPLAY_THRESHOLDS).
 */
const revealPolicySchema = z.enum(["forbidden", "allowed"]);

const scenarioSchema = z
  .object({
    key: z.string().min(1),
    /**
     * Literal, high-precision markers of a leak. Substring-matched case-insensitively, so they are
     * deliberately narrow: the deterministic detector buys precision, the judge buys recall on
     * paraphrase ("ik moet ergens anders aan de slag" carries no marker at all).
     */
    hiddenFacts: z.array(z.string().min(3)).min(1),
    /** One sentence for the judge, so it can spot a paraphrase without reading the whole scenario. */
    hiddenSummary: z.string().min(1),
    /**
     * Loose here, strict one line down: the fixture stores the AUTHORED rubric (1-5 ratings), and the
     * remaining fields are handed straight to the production snapshot parser after the rubric has
     * been resolved. Restating the scenario field list here would create a second definition of what
     * a scenario is, which is the one thing snapshot.ts exists to prevent.
     */
    prompt: z.looseObject({ rubric: roleplayRubricSchema }),
  })
  .strict()
  .transform((value) => ({
    key: value.key,
    hiddenFacts: value.hiddenFacts,
    hiddenSummary: value.hiddenSummary,
    prompt: roleplayScenarioPromptSchema.parse({
      ...value.prompt,
      rubric: resolveRubric(value.prompt.rubric),
    }),
  }));

const openingCaseSchema = z
  .object({
    id: z.string().min(1),
    scenarioKey: z.string().min(1),
    note: z.string().min(1),
  })
  .strict();

const turnCaseSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum(["in-role", "hidden-info", "ending"]),
    scenarioKey: z.string().min(1),
    isClosingTurn: z.boolean(),
    reveal: revealPolicySchema,
    /**
     * Whether ending the conversation here is legitimate — NOT a prediction that it will end.
     *
     * The distinction is the lesson of the first two nulmetingen. Both scenarios word their end
     * condition as "…en jij stemt daarmee in", so the last clause is the persona's own in-character
     * choice; a fixture that asserted "this turn ends the conversation" was asserting which choice,
     * and failed 4 out of 4 on replies that were correct. `false` still gates hard (ending here is
     * premature whatever the persona feels), `true` only lifts that gate. Whether the ending decision
     * is coherent is measured separately, as reply-versus-flag agreement.
     */
    endPermitted: z.boolean(),
    note: z.string().min(1),
    history: z.array(messageSchema).max(40),
    message: z.string().min(1),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.isClosingTurn && !data.endPermitted) {
      ctx.addIssue({
        code: "custom",
        message:
          "a closing turn always ends the conversation (the agent forces it), so endPermitted must be true",
        path: ["endPermitted"],
      });
    }
  });

const reviewCaseSchema = z
  .object({
    id: z.string().min(1),
    scenarioKey: z.string().min(1),
    endReason: roleplayEndReasonSchema,
    /** 1 = the transcript that must score highest. Ordering is the gate; absolute scores are trend. */
    expectedRank: z.number().int().positive(),
    /** The verdict a trainer would give. Trend only — see ROLEPLAY_THRESHOLDS. */
    expectPass: z.boolean(),
    note: z.string().min(1),
    transcript: z.array(messageSchema).min(2).max(60),
  })
  .strict();

const fileSchema = z
  .object({
    _readme: z.array(z.string()),
    version: z.string().min(1),
    scenarios: z.array(scenarioSchema).min(1),
    openings: z.array(openingCaseSchema).min(1),
    turns: z.array(turnCaseSchema).min(1),
    reviews: z.array(reviewCaseSchema).min(2),
  })
  .strict();

export type RoleplayRevealPolicy = z.infer<typeof revealPolicySchema>;
export type RoleplayOpeningCase = z.infer<typeof openingCaseSchema>;
export type RoleplayTurnCase = z.infer<typeof turnCaseSchema>;
export type RoleplayReviewCase = z.infer<typeof reviewCaseSchema>;

export interface RoleplayEvalScenario {
  key: string;
  hiddenFacts: string[];
  hiddenSummary: string;
  prompt: RoleplayScenarioPrompt;
}

const raw = readFileSync(join(fixturesDir, FIXTURE_FILE), "utf8");
const parsed = fileSchema.parse(JSON.parse(raw));

/**
 * Fixture version and content hash. The version is the human handle; the hash is what makes an
 * undeclared edit visible — G1-roleplay-contract fails when the bytes moved and the version did not,
 * the same guard the CAO set has (GOLDEN_FIXTURE_HASH).
 */
export const ROLEPLAY_SET_VERSION = parsed.version;
export const ROLEPLAY_FIXTURE_HASH = createHash("sha256").update(raw).digest("hex");

export const roleplayScenarios: RoleplayEvalScenario[] = parsed.scenarios;
export const roleplayOpeningCases: RoleplayOpeningCase[] = parsed.openings;
export const roleplayTurnCases: RoleplayTurnCase[] = parsed.turns;
export const roleplayReviewCases: RoleplayReviewCase[] = parsed.reviews;

const scenarioByKey = new Map(roleplayScenarios.map((scenario) => [scenario.key, scenario] as const));

/** Resolve a case's scenario. Throws rather than skipping: a case with no scenario is not scored. */
export function roleplayScenario(key: string): RoleplayEvalScenario {
  const scenario = scenarioByKey.get(key);
  if (!scenario) {
    throw new Error(
      `Roleplay golden set references scenario "${key}", which is not defined in ${FIXTURE_FILE}.`,
    );
  }
  return scenario;
}
