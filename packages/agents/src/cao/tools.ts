import { retrieveContext, type RetrievedChunk } from "@wunderstack/rag";
import { citationSchema } from "@wunderstack/shared";
import { z } from "zod";

/**
 * The retrieval tool contract: the agent's typed contract for turning a question into grounded CAO
 * context.
 *
 * It wraps the `@wunderstack/rag` pipeline (retrieve → rerank-seam → assemble) behind an explicit
 * Zod input/output contract, as 500-agents.mdc requires. In v1 retrieval is deterministic and the
 * agent orchestration calls `runRetrieval` directly (the chat runtime stays request/response — see
 * 400-data-rag.mdc), so the LLM does not decide when to retrieve.
 */

export const retrievalInputSchema = z.object({
  query: z.string().min(1, "query must not be empty"),
  /** Extra queries whose candidate pools are unioned before reranking (follow-up fallback). */
  additionalQueries: z.array(z.string().min(1)).max(2).optional(),
  /** O&O fund key — required for corpus isolation on the agent path. */
  fund: z.string().min(1),
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
}

/**
 * Run retrieval and shape it into the tool's output contract. Called directly by the agent in v1.
 */
export async function runRetrieval(input: RetrievalInput): Promise<RetrievalOutput> {
  const parsed = retrievalInputSchema.parse(input);
  const result = await retrieveContext({
    query: parsed.query,
    ...(parsed.additionalQueries === undefined ? {} : { additionalQueries: parsed.additionalQueries }),
    fund: parsed.fund,
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
