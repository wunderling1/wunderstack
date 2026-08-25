import { createGroundedAgent, verifyAndBuild as verifyAndBuildForProfile } from "../runtime/create-agent.js";
import type { RetrievalOutput } from "../runtime/profile.js";
import { arboProfile, arboQuestionSchema } from "./profile.js";

export { arboProfile, arboQuestionSchema };
export type { RetrievalOutput };

export function verifyAndBuild(raw: string, retrieval: RetrievalOutput, userSupplied: string) {
  return verifyAndBuildForProfile(arboProfile, raw, retrieval, userSupplied);
}

export {
  settledAnswerBody,
  settledAnswerEvents,
} from "../runtime/create-agent.js";

export function createArboAgent() {
  return createGroundedAgent(arboProfile);
}
