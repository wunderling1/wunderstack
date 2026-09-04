import { z } from "zod";

import type { AgentRuntimeProfile } from "../runtime/profile";
import { agentQuestionSchema } from "../types";
import {
  ARBO_SYSTEM_INSTRUCTIONS,
  NOT_IN_CATALOG_MESSAGE,
  UNVERIFIABLE_MESSAGE,
  buildAnswerPrompt,
} from "./prompt";
import { runRetrieval } from "./tools";

/**
 * Arbo question schema — same seam as the shared question schema with a lower minScore default
 * calibrated on the arbocatalogus corpus (per-fund override lives in agent_config).
 */
export const arboQuestionSchema = agentQuestionSchema.extend({
  minScore: z.number().min(0).max(1).default(0.35),
});

/**
 * Arbocatalogus agent profile. `clarify: null` — no clarify branch.
 * Kept free of `create-agent` imports so the registry cannot cycle through hard-facts.
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
