import { rerankDocuments } from "@wunderstack/ai";
import { requireRerankConfig } from "@wunderstack/shared";

import type { RetrievedChunk } from "./retrieve";

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

export type RerankStatus = "reranked" | "skipped" | "failed";

export interface RerankResult {
  chunks: RetrievedChunk[];
  /** Wall-clock ms for the rerank API call (0 when skipped). */
  rerankMs: number;
  /** True when reranking was skipped (disabled, single candidate, or high-confidence vector hit). */
  skipped: boolean;
  /** Whether rerank ran, was legitimately skipped, or failed (provider error / empty results). */
  status: RerankStatus;
  /** Machine-readable skip/fail reason for observability and eval gates. */
  reason?: string;
}

export async function rerank(input: RerankInput): Promise<RerankResult> {
  const config = requireRerankConfig();
  const topK = input.topK ?? config.topK;
  const ranked = input.chunks;

  if (ranked.length === 0) {
    return { chunks: ranked, rerankMs: 0, skipped: true, status: "skipped", reason: "empty" };
  }

  if (!config.enabled) {
    return {
      chunks: ranked.slice(0, topK),
      rerankMs: 0,
      skipped: true,
      status: "skipped",
      reason: "disabled",
    };
  }

  if (ranked.length === 1) {
    return {
      chunks: ranked.slice(0, topK),
      rerankMs: 0,
      skipped: true,
      status: "skipped",
      reason: "single-candidate",
    };
  }

  const topScore = ranked[0]?.score ?? 0;
  if (config.skipAboveScore !== null && topScore >= config.skipAboveScore) {
    return {
      chunks: ranked.slice(0, topK),
      rerankMs: 0,
      skipped: true,
      status: "skipped",
      reason: "high-confidence",
    };
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

    const rerankMs = performance.now() - rerankStart;

    if (reranked.length === 0) {
      return {
        chunks: ranked.slice(0, topK),
        rerankMs,
        skipped: false,
        status: "failed",
        reason: "empty-results",
      };
    }

    return { chunks: reranked, rerankMs, skipped: false, status: "reranked" };
  } catch (error) {
    // Provider unavailable or misconfigured — preserve retrieval order rather than fail the agent.
    const reason = error instanceof Error ? error.message : String(error);
    return {
      chunks: ranked.slice(0, topK),
      rerankMs: performance.now() - rerankStart,
      skipped: false,
      status: "failed",
      reason,
    };
  }
}
