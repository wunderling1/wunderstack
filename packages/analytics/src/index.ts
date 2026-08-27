// @wunderstack/analytics — the durable interaction event-log + KPI queries (Fase 1).
//
// The runtime writes one event per turn; the dashboard reads the KPIs via the read-only
// `analytics_reader` role. All DB access goes through the @wunderstack/db seam (400-data-rag).

export {
  interactionOutcomes,
  interactionEventInputSchema,
  type InteractionOutcome,
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
