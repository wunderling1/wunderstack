// @wunderstack/analytics — the durable interaction event-log + KPI queries (Fase 1).
//
// The runtime writes one event per turn; the dashboard reads the KPIs via the read-only
// `analytics_reader` role. All DB access goes through the @wunderstack/db seam (400-data-rag).

export {
  interactionEventInputSchema,
  type InteractionEventInput,
  type ParsedInteractionEvent,
} from "./event";

export {
  recordInteractionEvent,
  attachFeedbackByTrace,
  type RecordEventResult,
  type FeedbackSignal,
} from "./record";

export {
  deriveRetrievalStrength,
  RETRIEVAL_STRONG_MIN_SCORE,
  type RetrievalStrength,
} from "./retrieval-strength";

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
} from "./kpi";

export {
  getCorpusOverview,
  corpusFingerprint,
  corpusFingerprintDisplay,
  corpusFingerprintMatchesPinned,
  CORPUS_FINGERPRINT_LENGTH,
  type CorpusDocRow,
} from "./corpus";

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
  emptyOutcomeBreakdown,
  type OutcomeWindow,
  type OutcomeBreakdown,
  type OutcomeCounts,
  type RefusedReasonCount,
  type RefusedStrengthCounts,
  type Rate,
  type AgentOperationalStatus,
} from "./outcomes";

export { listOutcomeActivity, type OutcomeActivityRow } from "./outcome-activity";

// The overview's reads, grouped per page section — one fund-schema transaction each.
export {
  getActivitySnapshot,
  getAgentSnapshot,
  getAgentPanelSnapshot,
  type ActivitySnapshot,
  type AgentSnapshot,
  type AgentOutcomeRow,
  type AgentPanelSnapshot,
  type Pair,
  type TimeWindow,
  type WindowPair,
} from "./overview";

export {
  CONVERSATION_GAP_MINUTES,
  UNTHREADED_CHANNELS,
  groupIntoConversations,
  isThreadedChannel,
  type ConversationBoundaryRow,
  type ConversationGroup,
} from "./conversation-boundary";

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
} from "./conversations";

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
} from "./signals";
