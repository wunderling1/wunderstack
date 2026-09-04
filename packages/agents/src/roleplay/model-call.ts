import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { env } from "@wunderstack/shared";

import { createSovereignModel } from "../model/sovereign-model";
import { buildLangfuseObservability } from "../observability/langfuse";
import type { RoleplayModelCall } from "./types";
import { ROLEPLAY_MODEL_SETTINGS, ROLEPLAY_PROMPT_VERSION, ROLEPLAY_TIMEOUT_MS } from "./version";

/**
 * The default model call for the roleplay agent: Mastra for tracing, our own sovereign adapter for
 * the actual generation.
 *
 * Mastra never leaks past this package (500-agents.mdc), and `createSovereignModel` routes every
 * token through `@wunderstack/ai`, so a roleplay turn cannot reach a non-EU provider any more than a
 * grounded answer can. Scenario text and transcripts are fund data; that guarantee is not optional.
 *
 * One agent per branch. Mastra names spans after the agent, so separate agents give Langfuse three
 * distinguishable operations — an opening line, a turn, and a review have different latency and cost
 * profiles, and a single merged span would average them into something meaningless.
 */

const AGENT_KEY = "roleplay";

let cached: { mastra: Mastra; modelId: string } | undefined;

function getMastra(): { mastra: Mastra; modelId: string } {
  if (cached !== undefined) {
    return cached;
  }
  // One model instance for all three branches: it is stateless, and holding the reference is how we
  // report the model id. `Agent.getModel()` may hand back a promise, which is no use in a result.
  const model = createSovereignModel();
  const buildAgent = (branch: string): Agent =>
    new Agent({
      id: `${AGENT_KEY}-${branch}`,
      name: `${AGENT_KEY}-${branch}`,
      // Per-call instructions carry the scenario, so the constructor gets only the invariant part.
      instructions: "Je speelt een rol in een oefengesprek of beoordeelt er een.",
      model,
    });

  const observability = buildLangfuseObservability();
  const mastra = new Mastra({
    agents: {
      [`${AGENT_KEY}-opening`]: buildAgent("opening"),
      [`${AGENT_KEY}-turn`]: buildAgent("turn"),
      [`${AGENT_KEY}-review`]: buildAgent("review"),
    },
    ...(observability === undefined ? {} : { observability }),
  });
  cached = { mastra, modelId: model.modelId };
  return cached;
}

/** Test hook: drop the cached Mastra instance so a fresh one picks up changed env. */
export function resetRoleplayModelCache(): void {
  cached = undefined;
}

/**
 * Merge the caller's abort signal with the branch deadline. A review may legitimately take two
 * minutes; a turn that takes two minutes is a stall, and the learner is staring at a spinner.
 */
function callSignal(branch: keyof typeof ROLEPLAY_TIMEOUT_MS, caller?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(ROLEPLAY_TIMEOUT_MS[branch]);
  return caller ? AbortSignal.any([caller, deadline]) : deadline;
}

export const defaultRoleplayModelCall: RoleplayModelCall = async ({
  branch,
  system,
  user,
  sessionId,
  signal,
}) => {
  const { mastra, modelId } = getMastra();
  const registered = mastra.getAgent(`${AGENT_KEY}-${branch}`);
  const settings = ROLEPLAY_MODEL_SETTINGS[branch];

  const result = await registered.generate(
    [{ role: "user", content: user }] as Parameters<typeof registered.generate>[0],
    {
      instructions: system,
      modelSettings: {
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
      },
      tracingOptions: {
        metadata: {
          agentKey: AGENT_KEY,
          branch,
          promptVersion: ROLEPLAY_PROMPT_VERSION,
          environment: env.NODE_ENV,
          // The session id is the conversation id; there is no user id to record (R3).
          ...(sessionId === undefined ? {} : { sessionId }),
        },
        tags: [`${AGENT_KEY}-agent`, branch, ROLEPLAY_PROMPT_VERSION],
      },
      abortSignal: callSignal(branch, signal),
    },
  );

  return {
    text: result.text,
    usage: {
      promptTokens: result.usage.inputTokens ?? 0,
      completionTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0,
    },
    model: modelId,
  };
};
