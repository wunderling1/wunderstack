// @wunderstack/rag — retrieval pipeline: retrieve -> rerank -> assemble.
// See PLAN.md Fase 5 and PLAN-v2.md Fase 9.

import { requireRerankConfig } from "@wunderstack/shared";

import { assemble, type AssembledContext } from "./assemble.js";
import { rerank } from "./rerank.js";
import { retrieveInputSchema, retrieveValidated, type RetrieveInput } from "./retrieve.js";

/**
 * Run the full RAG retrieval pipeline for a query and return prompt-ready context + sources.
 *
 * retrieve (pgvector candidate pool) -> rerank (Scaleway sovereign) -> assemble (context + citations).
 */
export async function retrieveContext(input: RetrieveInput): Promise<AssembledContext> {
  const parsed = retrieveInputSchema.parse(input);
  const config = requireRerankConfig();
  const topK = parsed.topK ?? config.topK;
  const retrieved = await retrieveValidated(parsed);
  const reranked = await rerank({ query: parsed.query, chunks: retrieved, topK });
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
