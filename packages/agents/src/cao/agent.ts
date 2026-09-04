import { createGroundedAgent, verifyAndBuild as verifyAndBuildForProfile } from "../runtime/create-agent";
import type { RetrievalOutput } from "../runtime/profile";
import { caoProfile } from "./profile";

export { caoProfile };
export type { RetrievalOutput };

/** CAO-bound verify/guard — keeps eval + agent.test call-sites stable. */
export function verifyAndBuild(raw: string, retrieval: RetrievalOutput, userSupplied: string) {
  return verifyAndBuildForProfile(caoProfile, raw, retrieval, userSupplied);
}

export {
  settledAnswerBody,
  settledAnswerEvents,
} from "../runtime/create-agent";

/** Factory retained for smoke/latency/catalog call-sites (thin wrapper). */
export function createCaoAgent() {
  return createGroundedAgent(caoProfile);
}
