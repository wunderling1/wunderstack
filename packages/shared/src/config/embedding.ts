/**
 * The single, pinned embedding configuration for the whole system.
 *
 * The embedding model + dimension is the one near-irreversible choice in the stack: changing
 * it means a full re-embed + index migration (see .cursor/rules/400-data-rag.mdc). It is
 * therefore decided empirically by the Fase 3 bake-off, not by feeling.
 *
 * Pinned from the bake-off run of 2026-07-03 (scripts/bake-off/results.md): on the labeled
 * NL CAO seed set, `qwen3-embedding-8b` scored hit@1 100% / MRR 1.000, ahead of
 * `bge-multilingual-gemma2` (hit@1 91.3% / MRR 0.957). Both are EU-sovereign (Scaleway).
 *
 * Scaleway returns embeddings at the model's maximum dimension only (no Matryoshka trimming),
 * so `dim` is the native 4096. That exceeds pgvector's 2000-dim ANN-index limit: the Fase 4
 * `chunks.embedding vector(4096)` column must use a `flat` index (exact search), not
 * hnsw/ivfflat. Re-running the bake-off on a fund's real CAO may change this — treat any
 * change here as a deliberate re-embed migration.
 */

export interface EmbeddingConfig {
  /** Scaleway model id, e.g. "bge-multilingual-gemma2" or "qwen3-embedding-8b". */
  readonly model: string;
  /** Native output dimension of the chosen model (Scaleway returns max dim only). */
  readonly dim: number;
  /** Our embedding-config version tag, stored per vector so a re-embed is detectable. */
  readonly version: string;
}

export const EMBEDDING_CONFIG: EmbeddingConfig = {
  model: "qwen3-embedding-8b",
  dim: 4096,
  version: "1",
};

/**
 * Stable accessor for the pinned config. Retrieval (Fase 5) uses this to guarantee query and
 * corpus share one model + dimension.
 */
export function requireEmbeddingConfig(): EmbeddingConfig {
  return EMBEDDING_CONFIG;
}
