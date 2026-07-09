export { env } from "./env.js";
export type { Env } from "./env.js";

export {
  EMBEDDING_CONFIG,
  requireEmbeddingConfig,
  type EmbeddingConfig,
} from "./config/embedding.js";

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

export { parseCaoFunds, isFundScopeConfigured } from "./config/funds.js";
