import type { RoleplayCriterionScore, RoleplayEndReason } from "@wunderstack/shared";
import type { z } from "zod";

import type { AgentUsage } from "../types";
import type { roleplayScenarioPromptSchema } from "./snapshot";
import type { RoleplayBranch } from "./version";

/**
 * The roleplay seam. Deliberately not `GroundedAgent`: this agent retrieves nothing and cites
 * nothing, so the citation contract that makes the grounded product safe has nothing to say here
 * (DECISION-roleplay-agent.md, R1 and R5).
 *
 * Everything here is pure input/output. No database, no session lookup, no turn counting — the
 * runtime owns state, this module owns prompts and parsing. That is what makes it testable without a
 * database and what keeps `claim_roleplay_turn` the single place a turn is spent.
 */

/** One transcript entry. `user` is the learner, `assistant` is the persona. */
export interface RoleplayMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Scenario shapes are inferred from the snapshot schema, not declared twice.
 *
 * These objects are persisted as jsonb on `roleplay_sessions.scenario_snapshot` and parsed back on
 * every turn, so they need a runtime parser anyway. Making that parser authoritative removes the
 * possibility that the interface and the validator disagree about what a scenario is — which, for
 * the object that decides what a model is told to be, is not a difference worth risking.
 *
 * `RoleplayScenarioPrompt` deliberately has no `briefing`: that is the learner's preparation text,
 * and a persona that reads it starts steering toward the lesson instead of playing its role. It also
 * has no identity field — the persona never learns who it is talking to (R3). Both absences are
 * structural, not conventions, and `prompts.test.ts` locks them.
 */
export type WeightedCriterion = ResolvedRubric["criteria"][number];
export type ResolvedRubric = RoleplayScenarioPrompt["rubric"];
export type RoleplayScenarioPrompt = z.infer<typeof roleplayScenarioPromptSchema>;

export interface RoleplayTurnInput {
  scenario: RoleplayScenarioPrompt;
  /** Prior turns, oldest first. The seam applies its own window; pass everything you have. */
  history: RoleplayMessage[];
  /** What the learner just said. */
  message: string;
  /**
   * True when this is the last turn the budget allows. Derived by the caller from
   * `claim_roleplay_turn`, never guessed here — the counter is the authority on turns.
   */
  isClosingTurn: boolean;
}

export interface RoleplayTurnResult {
  /** The persona's reply, ready to store and show. */
  text: string;
  /** The persona considers the conversation finished. The caller still decides what to do about it. */
  conversationEnd: boolean;
  usage: AgentUsage;
  model: string;
  promptVersion: string;
}

export interface RoleplayOpeningInput {
  scenario: RoleplayScenarioPrompt;
}

export interface RoleplayOpeningResult {
  text: string;
  usage: AgentUsage;
  model: string;
  promptVersion: string;
}

/**
 * One criterion as scored, after normalisation against the authored rubric. `question` is verbatim
 * the authored text; the model's wording never survives normalisation.
 *
 * An alias, not a copy: the reviewer produces this shape, the fund schema stores it as jsonb, and
 * the API returns it. Three definitions of one shape is three chances to drift.
 */
export type ScoredCriterion = RoleplayCriterionScore;

export interface RoleplayReviewInput {
  scenario: RoleplayScenarioPrompt;
  /** The complete transcript. Never windowed — see `transcript.ts`. */
  history: RoleplayMessage[];
  endReason: RoleplayEndReason;
}

export interface RoleplayReviewResult {
  criteria: ScoredCriterion[];
  /** Σ(score × weight / 100), computed here and never taken from the model. */
  weightedScore: number;
  /** `weightedScore >= passThreshold`. Derived, not the model's opinion. */
  passed: boolean;
  feedbackSummary: string;
  /**
   * What the model claimed about passing. Not used for `passed`; kept so the eval family in Fase 6
   * can measure how far the model's own arithmetic drifts from the rubric.
   */
  modelReportedPassed: boolean;
  usage: AgentUsage;
  model: string;
  promptVersion: string;
}

/**
 * The one model call this module makes, as an injectable function.
 *
 * Everything above is deterministic given a model response, so tests drive the whole pipeline —
 * prompt assembly, JSON extraction, normalisation, scoring — with a stub and no network. The default
 * implementation wires Mastra and Langfuse (`model-call.ts`).
 */
export interface RoleplayModelCall {
  (input: {
    branch: RoleplayBranch;
    system: string;
    user: string;
    /** Stable per-conversation id, shared with the Langfuse trace. */
    sessionId?: string;
    signal?: AbortSignal;
  }): Promise<{ text: string; usage: AgentUsage; model: string }>;
}

export interface RoleplayAgent {
  openingLine(input: RoleplayOpeningInput, options?: RoleplayCallOptions): Promise<RoleplayOpeningResult>;
  nextTurn(input: RoleplayTurnInput, options?: RoleplayCallOptions): Promise<RoleplayTurnResult>;
  reviewSession(input: RoleplayReviewInput, options?: RoleplayCallOptions): Promise<RoleplayReviewResult>;
}

export interface RoleplayCallOptions {
  sessionId?: string;
  signal?: AbortSignal;
}
