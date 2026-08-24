import { z } from "zod";

import { createGroundedAgent, verifyAndBuild as verifyAndBuildForProfile } from "../runtime/create-agent.js";
import type { AgentRuntimeProfile } from "../runtime/profile.js";
import { agentQuestionSchema } from "../types.js";
import {
  ARBO_SYSTEM_INSTRUCTIONS,
  NOT_IN_CATALOG_MESSAGE,
  UNVERIFIABLE_MESSAGE,
  buildAnswerPrompt,
} from "./prompt.js";
import { runRetrieval, type RetrievalOutput } from "./tools.js";

export type { RetrievalOutput };

/**
 * Arbo question schema — same seam as the shared question schema with a lower minScore default
 * calibrated on the arbocatalogus corpus (per-fund override lives in agent_config).
 */
export const arboQuestionSchema = agentQuestionSchema.extend({
  minScore: z.number().min(0).max(1).default(0.35),
});

/**
 * Arbocatalogus agent profile. `clarify: null` — no clarify branch (behaviour unchanged).
 * Follow-up span: `${agentKey}-follow-ups` → `"arbo-follow-ups"` (same as before).
 */
export const arboProfile: AgentRuntimeProfile = {
  agentKey: "arbo",
  label: "Arbocatalogus-agent",
  description: "Antwoorden met bronvermelding uit de sectorale arbocatalogus",
  systemInstructions: ARBO_SYSTEM_INSTRUCTIONS,
  buildAnswerPrompt,
  notFoundMessage: NOT_IN_CATALOG_MESSAGE,
  unverifiableMessage: UNVERIFIABLE_MESSAGE,
  questionSchema: arboQuestionSchema,
  runRetrieval,
  clarify: null,
};

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
