export { env, envSchema } from "./env.js";
export type { Env } from "./env.js";

export {
  EMBEDDING_CONFIG,
  requireEmbeddingConfig,
  type EmbeddingConfig,
} from "./config/embedding.js";

export {
  agentConfigDataSchema,
  type AgentConfigData,
} from "./config/agent-config.js";

export {
  RERANK_CONFIG,
  requireRerankConfig,
  type RerankConfig,
} from "./config/rerank.js";

export {
  GENERATION_CONFIG,
  type GenerationConfig,
} from "./config/generation.js";

export {
  passages as caoLabeledPassages,
  queries as caoLabeledQueries,
  type CaoPassage,
  type LabeledQuery,
} from "./evals/cao-labeled-set.js";

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
export { parseCaoFunds, isFundScopeConfigured } from "./config/funds.js";

export {
  AGENT_KEYS,
  AGENT_KEY_LABELS,
  agentKeySchema,
  isAgentKey,
  type AgentKey,
} from "./config/agent-keys.js";

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

export { EVAL_FIXTURE_FUND } from "./config/eval.js";
