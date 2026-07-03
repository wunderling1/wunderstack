// @wunderstack/rag — retrieval pipeline: retrieve -> rerank (no-op seam) -> assemble.
// See PLAN.md Fase 5 and .cursor/rules/400-data-rag.mdc.

import { assemble, type AssembledContext } from "./assemble.js";
import { rerank } from "./rerank.js";
import { retrieve, retrieveInputSchema, type RetrieveInput } from "./retrieve.js";

/**
 * Run the full RAG retrieval pipeline for a query and return prompt-ready context + sources.
 *
 * retrieve (pgvector top-k) -> rerank (identity for now) -> assemble (context + citations).
 * The rerank step is a no-op seam today; a real reranker slots in without touching this call
 * site (see rerank.ts).
 */
export async function retrieveContext(input: RetrieveInput): Promise<AssembledContext> {
  const parsed = retrieveInputSchema.parse(input);
  const retrieved = await retrieve(parsed);
  const reranked = await rerank({ query: parsed.query, chunks: retrieved, topK: parsed.topK });
  return assemble(reranked);
}

export {
  retrieve,
  retrieveInputSchema,
  type RetrieveInput,
  type RetrievedChunk,
  type RetrievedChunkSource,
} from "./retrieve.js";
export { rerank, type RerankInput } from "./rerank.js";
export { assemble, type AssembledContext, type Source } from "./assemble.js";
