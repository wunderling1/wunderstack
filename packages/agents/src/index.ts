// @wunderstack/agents — agent definitions behind our own interface (Mastra hidden inside).
//
// This barrel exposes ONLY the seam: the CAO-agent factory and its Zod-typed contracts. Mastra and
// the AI SDK types never leak past here, so apps/RAG/API code depends on us, not on the framework
// (see .cursor/rules/500-agents.mdc). Implemented in Phase 6 (see docs/plans/PLAN.md).

export { createCaoAgent } from "./cao/agent.js";

export {
  agentDescriptorSchema,
  listAgents,
  getAgent,
  resetAgentCache,
  type AgentDescriptor,
} from "./catalog.js";

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
  caoQuestionSchema,
  caoAnswerSchema,
  caoCitationSchema,
  caoUsageSchema,
  type CaoAgent,
  type CaoAnswerOptions,
  type CaoQuestion,
  type CaoAnswer,
  type CaoCitation,
  type CaoUsage,
  type CaoStreamEvent,
} from "./types.js";

export { fetchPassage, type PassageInput, type PassageResult } from "./cao/passage.js";

export { orphanSourceRate, extractCitationMarkers } from "./cao/build-citations.js";
export { verifyCitations, normalizeWhitespace } from "./cao/verify-citations.js";
export { parseGenerationOutput, splitStreamBuffer, CITATIONS_SENTINEL } from "./cao/parse-generation.js";
