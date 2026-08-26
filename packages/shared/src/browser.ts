/**
 * Client-safe surface for browser bundles (`"use client"`).
 *
 * Re-exports contracts only. Never re-export `./env` (or anything that imports it): the main
 * `@wunderstack/shared` barrel parses `process.env` and would pull secret *names* into the learner
 * bundle whenever a client component imports the package root.
 */

export {
  citationSourceSchema,
  citationSchema,
  modelCitationSchema,
  type CitationSource,
  type Citation,
  type ModelCitation,
} from "./contracts/citation.js";

export {
  chatHistoryMessageSchema,
  chatRequestSchema,
  chatStatusPhases,
  chatEventSchema,
  type ChatRequest,
  type ChatCitation,
  type ChatStatusPhase,
  type ChatEvent,
} from "./contracts/chat.js";

export {
  agentChannels,
  agentChannelSchema,
  type AgentChannel,
} from "./contracts/channel.js";

export {
  tenantThemeSchema,
  tenantTextsSchema,
  tenantPublicConfigSchema,
  starterCategorySchema,
  isTenantKeyFormat,
  DEFAULT_ARTICLE_50_NOTICE,
  type TenantTheme,
  type TenantTexts,
  type TenantPublicConfig,
  type StarterCategory,
} from "./contracts/tenant-config.js";

export {
  ROLEPLAY_DIFFICULTIES,
  ROLEPLAY_DIFFICULTY_LABELS,
  ROLEPLAY_SCENARIO_STATUSES,
  ROLEPLAY_SCENARIO_STATUS_LABELS,
  ROLEPLAY_ORIGINS,
  ROLEPLAY_END_REASONS,
  ROLEPLAY_SESSION_STATUSES,
  ROLEPLAY_DELIVERY_STATUSES,
  roleplayDifficultySchema,
  roleplayDifficultyPromptsSchema,
  roleplayDifficultyMapSchema,
  roleplayScenarioStatusSchema,
  roleplayScenarioSlugSchema,
  roleplayScenarioDraftSchema,
  rubricCriterionDraftSchema,
  roleplayRubricDraftSchema,
  emptyRoleplayScenarioDraft,
  roleplayOriginSchema,
  roleplayEndReasonSchema,
  roleplaySessionStatusSchema,
  roleplayDeliveryStatusSchema,
  roleplayExternalRefSchema,
  roleplayWebhookTargetSchema,
  roleplayLti11TargetSchema,
  roleplayResultTargetSchema,
  rubricCriterionSchema,
  roleplayRubricSchema,
  type RoleplayDifficulty,
  type RoleplayDifficultyPrompts,
  type RoleplayDifficultyMap,
  type RoleplayScenarioStatus,
  type RoleplayOrigin,
  type RoleplayEndReason,
  type RoleplaySessionStatus,
  type RoleplayDeliveryStatus,
  type RubricCriterion,
  type RoleplayRubric,
  type RubricCriterionDraft,
  type RoleplayRubricDraft,
  type RoleplayScenarioDraft,
  type RoleplayWebhookTarget,
  type RoleplayLti11Target,
  type RoleplayResultTarget,
} from "./contracts/roleplay-scenario.js";

export { percentagesFromRatings } from "./contracts/roleplay-weights.js";

export { publicationIssues } from "./contracts/roleplay-publication.js";

export {
  roleplayCriterionScoreSchema,
  roleplayStartRequestSchema,
  roleplayStartResponseSchema,
  roleplayTurnRequestSchema,
  roleplayStatusPhases,
  roleplayEventSchema,
  roleplayReviewRequestSchema,
  roleplayReviewPayloadSchema,
  roleplayReviewResponseSchema,
  type RoleplayCriterionScore,
  type RoleplayStartRequest,
  type RoleplayStartResponse,
  type RoleplayTurnRequest,
  type RoleplayStatusPhase,
  type RoleplayEvent,
  type RoleplayReviewRequest,
  type RoleplayReviewPayload,
  type RoleplayReviewResponse,
} from "./contracts/roleplay.js";

export {
  roleplayResultEnvelopeSchema,
  buildRoleplayResultEnvelope,
  type RoleplayResultEnvelope,
  type BuildRoleplayResultEnvelopeInput,
} from "./contracts/roleplay-result.js";

export {
  WEBHOOK_EVENT_TYPES,
  webhookEventTypeSchema,
  webhookEventSchema,
  webhookAckSchema,
  webhookEventRequiresFund,
  type WebhookEventType,
  type WebhookEvent,
  type WebhookAck,
} from "./contracts/webhook.js";
