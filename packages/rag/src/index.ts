// @wunderstack/rag — retrieval pipeline: rewrite -> retrieve -> rerank -> assemble.
// See PLAN.md Fase 5 and PLAN-v2.md Fase 9/10.

import { requireRerankConfig } from "@wunderstack/shared";

import { assemble, type AssembledContext, type RetrievalTimings } from "./assemble.js";
import { rerank } from "./rerank.js";
import { retrieveInputSchema, retrieveValidatedTimed, type RetrieveInput } from "./retrieve.js";
import { rewriteQuery } from "./rewrite.js";

/**
 * Run the full RAG retrieval pipeline for a query and return prompt-ready context + sources.
 *
 * rewrite (normalize CAO jargon) -> retrieve (pgvector candidate pool) -> rerank (Scaleway
 * sovereign) -> assemble (context + citations). The rewrite enriches the query before embedding;
 * both retrieval and rerank use the rewritten form so they stay consistent.
 */
export async function retrieveContext(input: RetrieveInput): Promise<AssembledContext> {
  const totalStart = performance.now();
  const parsed = retrieveInputSchema.parse(input);
  const config = requireRerankConfig();
  const topK = parsed.topK ?? config.topK;

  const rewriteStart = performance.now();
  const { rewritten } = rewriteQuery(parsed.query);
  const rewriteMs = performance.now() - rewriteStart;

  const { chunks: retrieved, timings: retrieveTimings } = await retrieveValidatedTimed({
    ...parsed,
    query: rewritten,
  });

  const { chunks: reranked, rerankMs } = await rerank({ query: rewritten, chunks: retrieved, topK });

  const timings: RetrievalTimings = {
    rewriteMs,
    embedMs: retrieveTimings.embedMs,
    searchMs: retrieveTimings.searchMs,
    rerankMs,
    totalMs: performance.now() - totalStart,
  };

  return assemble(reranked, timings);
}

export {
  retrieve,
  retrieveInputSchema,
  type RetrieveInput,
  type RetrievedChunk,
  type RetrievedChunkSource,
  type RetrievedChunkStructure,
} from "./retrieve.js";
export { rerank, type RerankInput } from "./rerank.js";
export { rewriteQuery, type RewriteResult } from "./rewrite.js";
export { assemble, type AssembledContext, type RetrievalTimings } from "./assemble.js";
export {
  fetchParentPassage,
  listFunds,
  passageInputSchema,
  type PassageInput,
  type PassageResult,
} from "./passage.js";
