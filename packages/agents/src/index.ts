// @wunderstack/agents — agent definitions behind our own interface (Mastra hidden inside).
//
// This barrel exposes ONLY the seam: agent factories and their Zod-typed contracts. Mastra and
// the AI SDK types never leak past here, so apps/RAG/API code depends on us, not on the framework
// (see .cursor/rules/500-agents.mdc). Implemented in Phase 6 (see docs/plans/PLAN.md).

export { createCaoAgent } from "./cao/agent.js";
export { createArboAgent } from "./arbo/agent.js";

export {
  agentDescriptorSchema,
  listAgents,
  getAgent,
  resetAgentCache,
  type AgentDescriptor,
} from "./catalog.js";

export {
  AGENT_PROFILES,
  isGroundedAgentKey,
  listAgentProfiles,
  requireAgentProfile,
  type GroundedAgentKey,
} from "./runtime/registry.js";

export {
  recordFeedbackScore,
  recordNumericTraceScore,
  feedbackScoreSchema,
  type FeedbackScore,
  type RecordFeedbackResult,
  type RecordFeedbackOptions,
  type NumericTraceScore,
} from "./observability/feedback.js";

export {
  agentQuestionSchema,
  agentAnswerSchema,
  agentCitationSchema,
  agentUsageSchema,
  type GroundedAgent,
  type AgentAnswerOptions,
  type AgentQuestion,
  type AgentAnswer,
  type AgentCitation,
  type AgentUsage,
  type AgentStreamEvent,
} from "./types.js";

export { arboQuestionSchema } from "./arbo/profile.js";

export { fetchPassage, type PassageInput, type PassageResult } from "./runtime/passage.js";

export { orphanSourceRate, extractCitationMarkers } from "./runtime/build-citations.js";
export { verifyCitations, normalizeWhitespace } from "./runtime/verify-citations.js";
export { parseGenerationOutput, splitStreamBuffer, CITATIONS_SENTINEL } from "./runtime/parse-generation.js";

// Roleplay: a second agent shape, not a grounded agent. Own sub-barrel (see roleplay/index.ts).
export {
  createRoleplayAgent,
  resolveRubric,
  normalizeRubricWeights,
  computeWeightedScore,
  didPass,
  CONVERSATION_HISTORY_WINDOW,
  ROLEPLAY_PROMPT_VERSION,
  ROLEPLAY_TIMEOUT_MS,
  parseScenarioSnapshot,
  resolvePublishedScenario,
  startSession,
  loadSession,
  loadTranscript,
  claimTurn,
  appendTurn,
  appendTurnAndMaybeEnd,
  nextMessageOrdinals,
  endSession,
  loadReview,
  saveReview,
  claimReview,
  clearReviewClaim,
  enqueueResultDelivery,
  claimDueDeliveries,
  markDeliveryDelivered,
  markDeliveryFailed,
  ROLEPLAY_DELIVERY_MAX_ATTEMPTS,
  nextDeliveryAttemptAt,
  type RoleplayScenarioSnapshot,
  type ResolvedScenario,
  type RoleplaySessionRecord,
  type ClaimTurnResult,
  type StoredReview,
  type ClaimedDelivery,
  type CreateRoleplayAgentOptions,
  type RoleplayAgent,
  type RoleplayCallOptions,
  type RoleplayMessage,
  type RoleplayModelCall,
  type RoleplayOpeningInput,
  type RoleplayOpeningResult,
  type RoleplayReviewInput,
  type RoleplayReviewResult,
  type RoleplayScenarioPrompt,
  type RoleplayTurnInput,
  type RoleplayTurnResult,
  type ResolvedRubric,
  type ScoredCriterion,
  type WeightedCriterion,
} from "./roleplay/index.js";
