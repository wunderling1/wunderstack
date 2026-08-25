import { retrieveContext } from "@wunderstack/rag";

import {
  retrievalInputSchema,
  retrievalMetaSchema,
  type RetrievalInput,
  type RetrievalOutput,
} from "../runtime/retrieval.js";

export {
  retrievalInputSchema,
  retrievalHitSchema,
  retrievalMetaSchema,
  type RetrievalInput,
  type RetrievalMeta,
  type RetrievalOutput,
} from "../runtime/retrieval.js";

/**
 * The retrieval tool contract: the agent's typed contract for turning a question into grounded CAO
 * context.
 *
 * It wraps the `@wunderstack/rag` pipeline (retrieve → rerank-seam → assemble) behind an explicit
 * Zod input/output contract, as 500-agents.mdc requires. In v1 retrieval is deterministic and the
 * agent orchestration calls `runRetrieval` directly (the chat runtime stays request/response — see
 * 400-data-rag.mdc), so the LLM does not decide when to retrieve.
 */

/**
 * Run retrieval and shape it into the tool's output contract. Called directly by the agent in v1.
 */
export async function runRetrieval(input: RetrievalInput): Promise<RetrievalOutput> {
  const parsed = retrievalInputSchema.parse(input);
  const result = await retrieveContext({
    query: parsed.query,
    ...(parsed.additionalQueries === undefined ? {} : { additionalQueries: parsed.additionalQueries }),
    fund: parsed.fund,
    agentKey: "cao",
    topK: parsed.topK,
    minScore: parsed.minScore,
  });

  const meta = retrievalMetaSchema.parse({
    context: result.context,
    citations: result.citations,
    hits: result.chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      ordinal: chunk.ordinal,
      score: chunk.score,
      title: chunk.source.title,
    })),
    timings: result.timings,
  });

  return {
    ...meta,
    chunks: result.chunks,
    fullChunkContent: result.chunks.map((chunk) => [chunk.chunkId, chunk.content]),
  };
}
