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

export {
  getCorpusOverview,
  corpusFingerprint,
  CORPUS_FINGERPRINT_LENGTH,
  type CorpusDocRow,
} from "./corpus.js";

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

export { listOutcomeActivity, type OutcomeActivityRow } from "./outcome-activity.js";

export {
  CONVERSATION_GAP_MINUTES,
  UNTHREADED_CHANNELS,
  groupIntoConversations,
  isThreadedChannel,
  type ConversationBoundaryRow,
  type ConversationGroup,
} from "./conversation-boundary.js";

export {
  listConversations,
  getConversation,
  getConversationVolume,
  getExerciseActivity,
  breakdownCountForFilter,
  hasOutcomeFilter,
  includeExerciseSessions,
  includeGroundedTurns,
  matchesOutcomeFilter,
  mapExerciseRow,
  mapQuestionRow,
  toGroundedConversation,
  CONVERSATION_LIST_LIMIT,
  CONVERSATION_TURN_SCAN_CAP,
  type ConversationQuery,
  type ConversationItem,
  type ConversationList,
  type ConversationQuestion,
  type ConversationVolume,
  type GroundedConversation,
  type ExerciseConversation,
  type ExerciseActivity,
} from "./conversations.js";

export {
  listSignals,
  countKnowledgeGaps,
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
