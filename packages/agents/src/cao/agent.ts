import { createGroundedAgent, verifyAndBuild as verifyAndBuildForProfile } from "../runtime/create-agent.js";
import type { RetrievalOutput } from "../runtime/profile.js";
import { caoProfile } from "./profile.js";

export { caoProfile };
export type { RetrievalOutput };

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
