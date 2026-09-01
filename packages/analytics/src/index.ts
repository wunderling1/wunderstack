// @wunderstack/analytics — the durable interaction event-log + KPI queries (Fase 1).
//
// The runtime writes one event per turn; the dashboard reads the KPIs via the read-only
// `analytics_reader` role. All DB access goes through the @wunderstack/db seam (400-data-rag).

export {
  interactionEventInputSchema,
  type InteractionEventInput,
  type ParsedInteractionEvent,
} from "./event.js";

export {
  recordInteractionEvent,
  attachFeedbackByTrace,
  type RecordEventResult,
  type FeedbackSignal,
} from "./record.js";

export {
  deriveRetrievalStrength,
  RETRIEVAL_STRONG_MIN_SCORE,
  type RetrievalStrength,
} from "./retrieval-strength.js";

export {
  getKpiSummary,
  getTopThemes,
  getUnansweredQuestions,
  getRecentInteractions,
  getFundOverview,
  getAgentOverview,
  getAgentActivity,
  type KpiWindow,
  type KpiSummary,
  type ThemeCount,
  type UnansweredQuestion,
  type InteractionLogRow,
  type FundOverview,
  type FundOverviewLimits,
  type AgentOverview,
  type AgentActivityRow,
} from "./kpi.js";

export { getCorpusOverview, type CorpusDocRow } from "./corpus.js";

export {
  getOutcomeBreakdown,
  measurementStartedAt,
  deriveAgentStatus,
  deriveFundStatus,
  qualityDenominator,
  rateFromParts,
  answerRate,
  refusalRate,
  clarificationRate,
  errorRate,
  refusedJustifiedRate,
  refusedSuspiciousRate,
  strengthFromSignals,
  emptyRefusedStrength,
  countOutcome,
  type OutcomeWindow,
  type OutcomeBreakdown,
  type OutcomeCounts,
  type RefusedReasonCount,
  type RefusedStrengthCounts,
  type Rate,
  type AgentOperationalStatus,
} from "./outcomes.js";

export {
  listConversations,
  getConversation,
  breakdownCountForFilter,
  includeExerciseSessions,
  includeGroundedTurns,
  mapExerciseRow,
  mapGroundedRow,
  CONVERSATION_LIST_LIMIT,
  type ConversationQuery,
  type ConversationItem,
  type ConversationList,
  type GroundedConversation,
  type ExerciseConversation,
} from "./conversations.js";

export {
  listSignals,
  groupsAtOccurrenceThreshold,
  frequencyRecencyScore,
  sortByFrequencyRecency,
  mapQuestionSignal,
  includeExerciseAdoption,
  SIGNAL_MIN_OCCURRENCES,
  SIGNAL_LIST_LIMIT,
  type SignalsQuery,
  type QuestionSignal,
  type ExerciseAdoptionRow,
  type SignalsResult,
} from "./signals.js";
