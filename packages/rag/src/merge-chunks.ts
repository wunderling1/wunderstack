import type { RetrievedChunk } from "./retrieve";

/**
 * Union retrieved chunks from multiple queries, keeping the highest similarity score per chunk id.
 * Used when a follow-up retrieval runs a condensed query plus a history-aware fallback so one brittle
 * rewrite cannot drop the relevant passage.
 */
export function mergeRetrievedChunks(chunkLists: RetrievedChunk[][]): RetrievedChunk[] {
  const byId = new Map<string, RetrievedChunk>();
  for (const chunks of chunkLists) {
    for (const chunk of chunks) {
      const existing = byId.get(chunk.chunkId);
      if (existing === undefined || chunk.score > existing.score) {
        byId.set(chunk.chunkId, chunk);
      }
    }
  }
  return [...byId.values()].sort((left, right) => right.score - left.score);
}

/**
 * Unique pgvector candidates across queries (kept + dropped), before minScore is applied per list.
 * Dual-query overlaps count once — Langfuse `consideredCount` matches that, not a per-query sum.
 */
export function consideredChunkCount(
  lists: readonly { chunks: RetrievedChunk[]; droppedChunks: RetrievedChunk[] }[],
): number {
  return mergeRetrievedChunks(lists.map((list) => [...list.chunks, ...list.droppedChunks])).length;
}

/**
 * Drop any chunk that already cleared the floor in `kept`. Dual-query merges can put the same
 * chunkId in both lists (above threshold for one query, below for another); consumers of raw
 * droppedChunks must not see those ids as dropped.
 */
export function excludeKeptChunks(
  dropped: readonly RetrievedChunk[],
  kept: readonly RetrievedChunk[],
): RetrievedChunk[] {
  const keptIds = new Set(kept.map((chunk) => chunk.chunkId));
  return dropped.filter((chunk) => !keptIds.has(chunk.chunkId));
}
