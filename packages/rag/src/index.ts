// @wunderstack/rag — retrieval pipeline: rewrite -> retrieve -> rerank -> assemble.
// See docs/plans/PLAN.md Fase 5 and docs/plans/PLAN-v2.md Fase 9/10.

import { requireRerankConfig } from "@wunderstack/shared";

import { assemble, type AssembledContext, type RetrievalTimings } from "./assemble";
import { mergeRetrievedChunks } from "./merge-chunks";
import { rerank } from "./rerank";
import { retrieveInputSchema, retrieveValidatedTimed, type RetrieveInput } from "./retrieve";
import { rewriteQuery, type QueryExpansion } from "./rewrite";

type RetrieveContextInput = RetrieveInput & { queryExpansions?: QueryExpansion[] };

/**
 * Run the full RAG retrieval pipeline for a query and return prompt-ready context + sources.
 *
 * rewrite (normalize CAO jargon) -> retrieve (pgvector candidate pool) -> rerank (Scaleway
 * sovereign) -> assemble (context + citations). The rewrite enriches the query before embedding;
 * both retrieval and rerank use the rewritten form so they stay consistent.
 */
export async function retrieveContext(input: RetrieveContextInput): Promise<AssembledContext> {
  const totalStart = performance.now();
  const parsed = retrieveInputSchema.parse(input);
  const config = requireRerankConfig();
  const topK = parsed.topK ?? config.topK;

  const rewriteStart = performance.now();
  const expansions = input.queryExpansions;
  const primaryRewritten = rewriteQuery(parsed.query, expansions).rewritten;
  const additionalRewritten = (parsed.additionalQueries ?? []).map((query) =>
    rewriteQuery(query, expansions).rewritten,
  );

  const seenQueries = new Set<string>();
  const rewrittenQueries: string[] = [];
  for (const query of [primaryRewritten, ...additionalRewritten]) {
    const key = query.toLowerCase();
    if (seenQueries.has(key)) {
      continue;
    }
    seenQueries.add(key);
    rewrittenQueries.push(query);
  }
  const rewriteMs = performance.now() - rewriteStart;

  const retrieveLists =
    rewrittenQueries.length === 1
      ? [
          await retrieveValidatedTimed({
            ...parsed,
            query: rewrittenQueries[0]!,
          }),
        ]
      : await Promise.all(
          rewrittenQueries.map((query) =>
            retrieveValidatedTimed({
              ...parsed,
              query,
            }),
          ),
        );

  const retrieved =
    retrieveLists.length === 1
      ? (retrieveLists[0]?.chunks ?? [])
      : mergeRetrievedChunks(retrieveLists.map((result) => result.chunks));

  const consideredCount = retrieveLists.reduce((sum, result) => sum + result.consideredCount, 0);
  const droppedChunks =
    retrieveLists.length === 1
      ? (retrieveLists[0]?.droppedChunks ?? [])
      : mergeRetrievedChunks(retrieveLists.map((result) => result.droppedChunks));
  const aboveThresholdCount = retrieved.length;

  const embedMs = Math.max(...retrieveLists.map((result) => result.timings.embedMs));
  const searchMs = Math.max(...retrieveLists.map((result) => result.timings.searchMs));

  const { chunks: reranked, rerankMs } = await rerank({ query: primaryRewritten, chunks: retrieved, topK });

  const timings: RetrievalTimings = {
    rewriteMs,
    embedMs,
    searchMs,
    rerankMs,
    totalMs: performance.now() - totalStart,
  };

  return {
    ...assemble(reranked, timings),
    consideredCount,
    aboveThresholdCount,
    droppedChunks,
  };
}

export {
  retrieve,
  retrieveFromVector,
  embedQuery,
  searchPathForRetrieve,
  retrieveInputSchema,
  type RetrieveInput,
  type RetrieveFromVectorInput,
  type RetrievedChunk,
  type RetrievedChunkSource,
  type RetrievedChunkStructure,
} from "./retrieve";
export { mergeRetrievedChunks } from "./merge-chunks";
export { rerank, type RerankInput, type RerankResult, type RerankStatus } from "./rerank";
export { rewriteQuery, type RewriteResult, type QueryExpansion } from "./rewrite";
export { assemble, type AssembledContext, type RetrievalTimings } from "./assemble";
export { deriveChunkHeading } from "./heading";
export {
  fetchParentPassage,
  listCorpora,
  listCorpusDocuments,
  listStructuralRefs,
  passageInputSchema,
  structuralRefsInputSchema,
  type CorpusDocument,
  type CorpusKey,
  type PassageInput,
  type PassageResult,
  type StructuralRefs,
} from "./passage";
// Re-exported so short-lived callers (the eval run) can close the DB pool and exit cleanly without
// depending on @wunderstack/db directly. Long-lived servers keep the pool and never call this.
export { closeDb } from "@wunderstack/db";
