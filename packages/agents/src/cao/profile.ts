import type { AgentRuntimeProfile } from "../runtime/profile.js";
import { agentQuestionSchema } from "../types.js";
import { detectClarification } from "./clarify.js";
import { CAO_SYSTEM_INSTRUCTIONS, NOT_FOUND_MESSAGE, UNVERIFIABLE_MESSAGE, buildAnswerPrompt } from "./prompt.js";
import { runRetrieval } from "./tools.js";

/**
 * CAO agent profile — specialisation for {@link createGroundedAgent}.
 * Kept free of `create-agent` imports so `registry` → profile → hard-facts cannot cycle.
 */
export const caoProfile: AgentRuntimeProfile = {
  agentKey: "cao",
  label: "CAO-agent",
  description: "Antwoorden met bronvermelding uit CAO-teksten",
  systemInstructions: CAO_SYSTEM_INSTRUCTIONS,
  buildAnswerPrompt,
  notFoundMessage: NOT_FOUND_MESSAGE,
  unverifiableMessage: UNVERIFIABLE_MESSAGE,
  questionSchema: agentQuestionSchema,
  runRetrieval,
  clarify: detectClarification,
};
