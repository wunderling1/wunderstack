import { retrieveContext, type RetrievedChunk } from "@wunderstack/rag";
import { citationSchema } from "@wunderstack/shared";
import { z } from "zod";

import { ARBO_QUERY_EXPANSIONS, rewriteArboQuery } from "./rewrite.js";

export const retrievalInputSchema = z.object({
  query: z.string().min(1),
  additionalQueries: z.array(z.string().min(1)).max(2).optional(),
  fund: z.string().min(1),
  topK: z.number().int().positive().max(50).default(5),
  minScore: z.number().min(0).max(1).default(0),
});

export type RetrievalInput = z.input<typeof retrievalInputSchema>;

export const retrievalHitSchema = z.object({
  chunkId: z.string(),
  ordinal: z.number().int(),
  score: z.number(),
  title: z.string(),
});

export const retrievalMetaSchema = z.object({
  context: z.string(),
  citations: z.array(citationSchema),
  hits: z.array(retrievalHitSchema),
  timings: z.object({
    rewriteMs: z.number(),
    embedMs: z.number(),
    searchMs: z.number(),
    rerankMs: z.number(),
    totalMs: z.number(),
  }),
});

export type RetrievalMeta = z.infer<typeof retrievalMetaSchema>;

export interface RetrievalOutput extends RetrievalMeta {
  chunks: RetrievedChunk[];
  fullChunkContent: [string, string][];
}

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
