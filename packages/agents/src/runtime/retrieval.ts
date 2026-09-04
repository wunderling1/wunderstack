import { retrieveContext, type QueryExpansion, type RetrievedChunk } from "@wunderstack/rag";
import { citationSchema } from "@wunderstack/shared";
import { z } from "zod";

/**
 * Shared grounded-retrieval contract (F1-08). Agent wrappers stay thin: CAO calls this helper
 * directly; arbo rewrites the query first. `agentKey` is always supplied by the pipeline from
 * `profile.agentKey` — never a hardcoded literal in a wrapper.
 */

export const retrievalInputSchema = z.object({
  query: z.string().min(1, "query must not be empty"),
  /** Extra queries whose candidate pools are unioned before reranking (follow-up fallback). */
  additionalQueries: z.array(z.string().min(1)).max(2).optional(),
  /** O&O fund key — required for corpus isolation on the agent path. */
  fund: z.string().min(1),
  /** Which agent's corpus to search — must match the runtime profile. */
  agentKey: z.string().min(1),
  /** How many chunks to keep after reranking (fed to the agent). Defaults to RERANK_CONFIG.topK (5). */
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
  /** Prompt-ready context block, each passage prefixed with its `[ref]` + chunk_id + sourceRef. */
  context: z.string(),
  /** Per-chunk retrieval placeholders (filtered to verified citations after generation). */
  citations: z.array(citationSchema),
  /** Per-chunk hits (id + similarity score) — recorded on the Langfuse trace for observability. */
  hits: z.array(retrievalHitSchema),
  /** Per-phase retrieval timings for Langfuse latency budgets. */
  timings: z.object({
    rewriteMs: z.number(),
    embedMs: z.number(),
    searchMs: z.number(),
    rerankMs: z.number(),
    totalMs: z.number(),
  }),
});

export type RetrievalMeta = z.infer<typeof retrievalMetaSchema>;

/**
 * Full tool output. The serializable metadata is Zod-validated; the ranked chunks pass through
 * unvalidated (they carry the full text needed for verbatim citation verification and stay inside
 * this package — they are never sent over a wire).
 */
export interface RetrievalOutput extends RetrievalMeta {
  chunks: RetrievedChunk[];
  /** chunkId -> full chunk content, for verbatim quote verification. */
  fullChunkContent: [string, string][];
  consideredCount: number;
  aboveThresholdCount: number;
  droppedChunks: RetrievedChunk[];
  progressFound: RetrievedChunk[];
  progressDropped: RetrievedChunk[];
  usedPassageCount: number;
}

export interface RunGroundedRetrievalOptions {
  /** Optional lexical expansions (arbo). */
  queryExpansions?: QueryExpansion[];
}

/**
 * Run retrieval and shape it into the shared output contract. Uses `input.agentKey` for corpus
 * isolation — the caller (pipeline / profile) owns that value.
 */
export async function runGroundedRetrieval(
  input: RetrievalInput,
  options: RunGroundedRetrievalOptions = {},
): Promise<RetrievalOutput> {
  const parsed = retrievalInputSchema.parse(input);
  const result = await retrieveContext({
    query: parsed.query,
    ...(parsed.additionalQueries === undefined ? {} : { additionalQueries: parsed.additionalQueries }),
    fund: parsed.fund,
    agentKey: parsed.agentKey,
    topK: parsed.topK,
    minScore: parsed.minScore,
    ...(options.queryExpansions === undefined ? {} : { queryExpansions: options.queryExpansions }),
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
    consideredCount: result.consideredCount,
    aboveThresholdCount: result.aboveThresholdCount,
    droppedChunks: result.droppedChunks,
    progressFound: result.progressFound,
    progressDropped: result.progressDropped,
    usedPassageCount: result.usedPassageCount,
  };
}
