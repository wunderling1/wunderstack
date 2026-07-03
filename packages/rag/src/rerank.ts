import type { RetrievedChunk } from "./retrieve.js";

/**
 * Rerank step of the RAG pipeline — deliberately a **pass-through (identity)** for now.
 *
 * This is the open seam the rules require (see 400-data-rag.mdc): a real cross-encoder such as
 * `bge-reranker-v2-m3` slots in here later without changing the pipeline shape. It stays async
 * so swapping in a network-backed reranker does not change any call site.
 */

export interface RerankInput {
  /** The original user query — unused by the identity reranker, kept for the future contract. */
  query: string;
  chunks: RetrievedChunk[];
  /** Optionally trim to the top-N after reranking. */
  topK?: number;
}

export async function rerank(input: RerankInput): Promise<RetrievedChunk[]> {
  // Identity: preserve the retrieval order. A future reranker reorders by relevance here.
  const ranked = input.chunks;
  return typeof input.topK === "number" ? ranked.slice(0, input.topK) : ranked;
}
