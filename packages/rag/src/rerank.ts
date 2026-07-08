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

export interface RerankResult {
  chunks: RetrievedChunk[];
  /** Wall-clock ms for the rerank API call (0 when skipped). */
  rerankMs: number;
  /** True when reranking was skipped (disabled, single candidate, or high-confidence vector hit). */
  skipped: boolean;
}

export async function rerank(input: RerankInput): Promise<RerankResult> {
  const config = requireRerankConfig();
  const topK = input.topK ?? config.topK;
  const ranked = input.chunks;

  if (ranked.length === 0) {
    return { chunks: ranked, rerankMs: 0, skipped: true };
  }

  if (!config.enabled || ranked.length === 1) {
    return { chunks: ranked.slice(0, topK), rerankMs: 0, skipped: true };
  }

  const topScore = ranked[0]?.score ?? 0;
  if (config.skipAboveScore !== null && topScore >= config.skipAboveScore) {
    return { chunks: ranked.slice(0, topK), rerankMs: 0, skipped: true };
  }

  const rerankStart = performance.now();
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
      return { chunks: ranked.slice(0, topK), rerankMs: performance.now() - rerankStart, skipped: false };
    }

    return { chunks: reranked, rerankMs: performance.now() - rerankStart, skipped: false };
  } catch {
    // Provider unavailable or misconfigured — preserve retrieval order rather than fail the agent.
    return { chunks: ranked.slice(0, topK), rerankMs: performance.now() - rerankStart, skipped: false };
  }
}
