import { createGroundedAgent, verifyAndBuild as verifyAndBuildForProfile } from "../runtime/create-agent.js";
import type { AgentRuntimeProfile } from "../runtime/profile.js";
import { agentQuestionSchema } from "../types.js";
import { detectClarification } from "./clarify.js";
import { CAO_SYSTEM_INSTRUCTIONS, NOT_FOUND_MESSAGE, UNVERIFIABLE_MESSAGE, buildAnswerPrompt } from "./prompt.js";
import { runRetrieval, type RetrievalOutput } from "./tools.js";

export type { RetrievalOutput };

/**
 * CAO agent profile — one row of specialisation for {@link createGroundedAgent}.
 * Follow-up Langfuse span stays `"cao-follow-ups"` (hardcoded historically; profile.agentKey yields the same).
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

/** CAO-bound verify/guard — keeps eval + agent.test call-sites stable. */
export function verifyAndBuild(raw: string, retrieval: RetrievalOutput, userSupplied: string) {
  return verifyAndBuildForProfile(caoProfile, raw, retrieval, userSupplied);
}

export {
  settledAnswerBody,
  settledAnswerEvents,
} from "../runtime/create-agent.js";

/** Factory retained for smoke/latency/catalog call-sites (thin wrapper). */
export function createCaoAgent() {
  return createGroundedAgent(caoProfile);
}
