import { retrieveContext } from "@wunderstack/rag";

import {
  retrievalInputSchema,
  retrievalMetaSchema,
  type RetrievalInput,
  type RetrievalOutput,
} from "../runtime/retrieval.js";
import { ARBO_QUERY_EXPANSIONS, rewriteArboQuery } from "./rewrite.js";

export {
  retrievalInputSchema,
  retrievalHitSchema,
  retrievalMetaSchema,
  type RetrievalInput,
  type RetrievalMeta,
  type RetrievalOutput,
} from "../runtime/retrieval.js";

export async function runRetrieval(input: RetrievalInput): Promise<RetrievalOutput> {
  const parsed = retrievalInputSchema.parse(input);
  const primary = rewriteArboQuery(parsed.query);
  const result = await retrieveContext({
    query: primary.rewritten,
    ...(parsed.additionalQueries === undefined ? {} : { additionalQueries: parsed.additionalQueries }),
    fund: parsed.fund,
    agentKey: "arbo",
    topK: parsed.topK,
    minScore: parsed.minScore,
    queryExpansions: ARBO_QUERY_EXPANSIONS,
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
