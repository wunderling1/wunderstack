import { defaultRoleplayModelCall } from "./model-call.js";
import {
  buildJsonRetryUserMessage,
  buildOpeningSystemPrompt,
  buildOpeningUserMessage,
  buildReviewSystemPrompt,
  buildReviewUserMessage,
  buildTurnSystemPrompt,
  buildTurnUserMessage,
} from "./prompts.js";
import { computeWeightedScore, didPass } from "./rubric.js";
import {
  extractJsonObject,
  normalizeReviewOutput,
  roleplayOpeningOutputSchema,
  roleplayReviewOutputSchema,
  roleplayTurnOutputSchema,
} from "./schemas.js";
import {
  formatHistoryForPrompt,
  formatTranscriptForReview,
  windowHistory,
} from "./transcript.js";
import type { AgentUsage as RoleplayUsage } from "../types.js";
import type {
  RoleplayAgent,
  RoleplayCallOptions,
  RoleplayModelCall,
  RoleplayOpeningInput,
  RoleplayOpeningResult,
  RoleplayReviewInput,
  RoleplayReviewResult,
  RoleplayTurnInput,
  RoleplayTurnResult,
} from "./types.js";
import { ROLEPLAY_PROMPT_VERSION, type RoleplayBranch } from "./version.js";

/**
 * The roleplay agent: three calls, no state.
 *
 * Everything that persists — the session row, the transcript, the turn counter — belongs to the
 * runtime. This module turns a scenario plus a transcript into a prompt, and a model response into a
 * validated result. That split is what keeps `claim_roleplay_turn` the only place a turn is spent,
 * and what lets the whole pipeline be tested with a stub instead of a database and a provider.
 */

export interface CreateRoleplayAgentOptions {
  /** Override the model call. Tests inject a stub; production leaves this alone. */
  generate?: RoleplayModelCall;
}

function callArgs(options: RoleplayCallOptions | undefined) {
  return {
    ...(options?.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    ...(options?.signal === undefined ? {} : { signal: options.signal }),
  };
}

/**
 * One model call, parsed, with exactly one retry when the response is not usable JSON.
 *
 * One, not a loop: a second failure is a model that will not comply, and hammering it burns the
 * learner's wait rather than their result. Both calls' usage is reported, because a retried turn
 * really did cost twice. See buildJsonRetryUserMessage for why this exists at all.
 */
async function generateParsed<T>(
  generate: RoleplayModelCall,
  request: { branch: RoleplayBranch; system: string; user: string },
  callOptions: RoleplayCallOptions | undefined,
  parse: (text: string) => T,
): Promise<{ value: T; usage: RoleplayUsage; model: string }> {
  const response = await generate({ ...request, ...callArgs(callOptions) });
  try {
    return { value: parse(response.text), usage: response.usage, model: response.model };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const retry = await generate({
      branch: request.branch,
      system: request.system,
      user: buildJsonRetryUserMessage(request.user, response.text, reason),
      ...callArgs(callOptions),
    });
    return {
      value: parse(retry.text),
      usage: {
        promptTokens: response.usage.promptTokens + retry.usage.promptTokens,
        completionTokens: response.usage.completionTokens + retry.usage.completionTokens,
        totalTokens: response.usage.totalTokens + retry.usage.totalTokens,
      },
      model: retry.model,
    };
  }
}

export function createRoleplayAgent(
  options: CreateRoleplayAgentOptions = {},
): RoleplayAgent {
  const generate = options.generate ?? defaultRoleplayModelCall;

  return {
    async openingLine(
      input: RoleplayOpeningInput,
      callOptions?: RoleplayCallOptions,
    ): Promise<RoleplayOpeningResult> {
      const { value, usage, model } = await generateParsed(
        generate,
        {
          branch: "opening",
          system: buildOpeningSystemPrompt(input.scenario),
          user: buildOpeningUserMessage(input.scenario),
        },
        callOptions,
        (text) => roleplayOpeningOutputSchema.parse(extractJsonObject(text)),
      );

      return {
        text: value.text.trim(),
        usage,
        model,
        promptVersion: ROLEPLAY_PROMPT_VERSION,
      };
    },

    async nextTurn(
      input: RoleplayTurnInput,
      callOptions?: RoleplayCallOptions,
    ): Promise<RoleplayTurnResult> {
      const history = windowHistory(input.history);
      const { value, usage, model } = await generateParsed(
        generate,
        {
          branch: "turn",
          system: buildTurnSystemPrompt(input.scenario, input.isClosingTurn),
          user: buildTurnUserMessage(
            input.scenario,
            input.message,
            formatHistoryForPrompt(history, input.scenario.userTitle, input.scenario.partnerRole),
          ),
        },
        callOptions,
        (text) => roleplayTurnOutputSchema.parse(extractJsonObject(text)),
      );

      return {
        text: value.text.trim(),
        // On the closing turn the conversation is over whatever the model says. The turn budget is
        // the runtime's decision, and a persona that forgets to set the flag must not extend it.
        conversationEnd: input.isClosingTurn || value.conversationEnd,
        usage,
        model,
        promptVersion: ROLEPLAY_PROMPT_VERSION,
      };
    },

    async reviewSession(
      input: RoleplayReviewInput,
      callOptions?: RoleplayCallOptions,
    ): Promise<RoleplayReviewResult> {
      // No window: the reviewer sees the whole conversation (see transcript.ts).
      const { value, usage, model } = await generateParsed(
        generate,
        {
          branch: "review",
          system: buildReviewSystemPrompt(input.scenario, input.endReason),
          user: buildReviewUserMessage(
            input.scenario,
            formatTranscriptForReview(input.history, input.scenario.userTitle),
          ),
        },
        callOptions,
        (text) => roleplayReviewOutputSchema.parse(extractJsonObject(text)),
      );

      const criteria = normalizeReviewOutput(value, input.scenario.rubric.criteria);
      const weightedScore = computeWeightedScore(criteria);

      return {
        criteria,
        weightedScore,
        passed: didPass(weightedScore, input.scenario.rubric.passThreshold),
        feedbackSummary: value.feedbackSummary.trim(),
        modelReportedPassed: value.isPassed,
        usage,
        model,
        promptVersion: ROLEPLAY_PROMPT_VERSION,
      };
    },
  };
}
