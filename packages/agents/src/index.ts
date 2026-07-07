// @wunderstack/agents — agent definitions behind our own interface (Mastra hidden inside).
//
// This barrel exposes ONLY the seam: the CAO-agent factory and its Zod-typed contracts. Mastra and
// the AI SDK types never leak past here, so apps/RAG/API code depends on us, not on the framework
// (see .cursor/rules/500-agents.mdc). Implemented in Phase 6 (see PLAN.md).

export { createCaoAgent } from "./cao/agent.js";

export {
  caoQuestionSchema,
  caoAnswerSchema,
  caoSourceSchema,
  caoCitationSchema,
  caoUsageSchema,
  type CaoAgent,
  type CaoAnswerOptions,
  type CaoQuestion,
  type CaoAnswer,
  type CaoSource,
  type CaoCitation,
  type CaoUsage,
  type CaoStreamEvent,
} from "./types.js";
