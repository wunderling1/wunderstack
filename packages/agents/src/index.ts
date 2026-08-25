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
  isAgentKey,
  listAgentProfiles,
  requireAgentProfile,
  type AgentKey,
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
