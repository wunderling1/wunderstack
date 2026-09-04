import { env } from "../env";

/**
 * The single, pinned rerank configuration for the RAG pipeline.
 *
 * Scaleway Generative APIs expose a sovereign EU rerank endpoint (`POST /v1/rerank`).
 * The plan originally targeted `bge-reranker-v2-m3`, but that model is not available on
 * Scaleway's serverless catalog (verified Jul 2026). We use `qwen3-embedding-8b` — the same
 * model as retrieval embeddings — behind a swappable seam. A true cross-encoder can slot in
 * later without changing call sites.
 *
 * See packages/ai/src/rerank.ts and packages/rag/src/rerank.ts.
 */

export interface RerankConfig {
  /** Scaleway rerank model id. */
  readonly model: string;
  /** Our rerank-config version tag for observability and future migrations. */
  readonly version: string;
  /** How many chunks to retrieve from pgvector before reranking. */
  readonly candidateK: number;
  /** How many chunks to keep after reranking (fed to the agent). */
  readonly topK: number;
  /** When false, the pipeline skips the rerank call and uses retrieval order. */
  readonly enabled: boolean;
  /**
   * When the top vector score is >= this value, skip rerank and use retrieval order.
   * Null disables conditional skip (always rerank when enabled).
   */
  readonly skipAboveScore: number | null;
}

export const RERANK_CONFIG: RerankConfig = {
  model: "qwen3-embedding-8b",
  version: "1",
  candidateK: 15,
  topK: 5,
  enabled: true,
  /** Skip rerank when the top vector score is already this confident (saves a Scaleway round-trip). */
  skipAboveScore: 0.85,
};

/**
 * Stable accessor for the pinned rerank config. The RAG pipeline uses this so retrieval and
 * rerank share one model choice. Env overrides (RERANK_*) are applied here when set.
 */
export function requireRerankConfig(): RerankConfig {
  return {
    model: env.RERANK_MODEL ?? RERANK_CONFIG.model,
    version: RERANK_CONFIG.version,
    candidateK: env.RERANK_CANDIDATE_K ?? RERANK_CONFIG.candidateK,
    topK: env.RERANK_TOP_K ?? RERANK_CONFIG.topK,
    enabled: env.RERANK_ENABLED === undefined ? RERANK_CONFIG.enabled : env.RERANK_ENABLED === "true",
    skipAboveScore: env.RERANK_SKIP_ABOVE_SCORE === undefined
      ? RERANK_CONFIG.skipAboveScore
      : env.RERANK_SKIP_ABOVE_SCORE === "null"
        ? null
        : Number(env.RERANK_SKIP_ABOVE_SCORE),
  };
}
