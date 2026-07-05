// @wunderstack/rag — retrieval pipeline: rewrite -> retrieve -> rerank -> assemble.
// See PLAN.md Fase 5 and PLAN-v2.md Fase 9/10.

import { requireRerankConfig } from "@wunderstack/shared";

import { assemble, type AssembledContext } from "./assemble.js";
import { rerank } from "./rerank.js";
import { retrieveInputSchema, retrieveValidated, type RetrieveInput } from "./retrieve.js";
import { rewriteQuery } from "./rewrite.js";

/**
 * Run the full RAG retrieval pipeline for a query and return prompt-ready context + sources.
 *
 * rewrite (normalize CAO jargon) -> retrieve (pgvector candidate pool) -> rerank (Scaleway
 * sovereign) -> assemble (context + citations). The rewrite enriches the query before embedding;
 * both retrieval and rerank use the rewritten form so they stay consistent.
 */
export async function retrieveContext(input: RetrieveInput): Promise<AssembledContext> {
  const parsed = retrieveInputSchema.parse(input);
  const config = requireRerankConfig();
  const topK = parsed.topK ?? config.topK;
  const { rewritten } = rewriteQuery(parsed.query);
  const retrieved = await retrieveValidated({ ...parsed, query: rewritten });
  const reranked = await rerank({ query: rewritten, chunks: retrieved, topK });
  return assemble(reranked);
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
export { assemble, type AssembledContext, type Source } from "./assemble.js";
