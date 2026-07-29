import type { RetrievedChunk } from "./retrieve.js";

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
