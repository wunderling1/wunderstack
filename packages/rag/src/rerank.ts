import { rerankDocuments } from "@wunderstack/ai";
import { requireRerankConfig } from "@wunderstack/shared";

import type { RetrievedChunk } from "./retrieve.js";

/**
 * Rerank step of the RAG pipeline — reorders retrieval candidates by relevance.
 *
 * Calls Scaleway's sovereign `/v1/rerank` endpoint via @wunderstack/ai. On failure or when
 * reranking is disabled, falls back to the retrieval order (identity) so the pipeline keeps
 * working. A future cross-encoder slots in behind the same seam.
 */

export interface RerankInput {
  query: string;
  chunks: RetrievedChunk[];
  /** How many chunks to keep after reranking. */
  topK?: number;
}

export async function rerank(input: RerankInput): Promise<RetrievedChunk[]> {
  const config = requireRerankConfig();
  const topK = input.topK ?? config.topK;
  const ranked = input.chunks;

  if (ranked.length === 0) {
    return ranked;
  }

  if (!config.enabled || ranked.length === 1) {
    return ranked.slice(0, topK);
  }

  try {
    const result = await rerankDocuments({
      query: input.query,
      documents: ranked.map((chunk) => chunk.content),
      topN: topK,
      model: config.model,
    });

    const reranked = result.results
      .map((entry) => {
        const chunk = ranked[entry.index];
        if (!chunk) {
          return undefined;
        }
        return {
          ...chunk,
          score: entry.relevanceScore,
        };
      })
      .filter((chunk): chunk is RetrievedChunk => chunk !== undefined);

    if (reranked.length === 0) {
      return ranked.slice(0, topK);
    }

    return reranked;
  } catch {
    // Provider unavailable or misconfigured — preserve retrieval order rather than fail the agent.
    return ranked.slice(0, topK);
  }
}
