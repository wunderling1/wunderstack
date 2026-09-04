import type { AgentRuntimeProfile } from "../runtime/profile";
import { agentQuestionSchema } from "../types";
import { detectClarification } from "./clarify";
import { CAO_SYSTEM_INSTRUCTIONS, NOT_FOUND_MESSAGE, UNVERIFIABLE_MESSAGE, buildAnswerPrompt } from "./prompt";
import { runRetrieval } from "./tools";

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
