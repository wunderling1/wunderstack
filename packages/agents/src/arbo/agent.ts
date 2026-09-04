import { createGroundedAgent, verifyAndBuild as verifyAndBuildForProfile } from "../runtime/create-agent";
import type { RetrievalOutput } from "../runtime/profile";
import { arboProfile, arboQuestionSchema } from "./profile";

export { arboProfile, arboQuestionSchema };
export type { RetrievalOutput };

export function verifyAndBuild(raw: string, retrieval: RetrievalOutput, userSupplied: string) {
  return verifyAndBuildForProfile(arboProfile, raw, retrieval, userSupplied);
}

export {
  settledAnswerBody,
  settledAnswerEvents,
} from "../runtime/create-agent";

export function createArboAgent() {
  return createGroundedAgent(arboProfile);
}
