import { retrieveContext } from "@wunderstack/rag";
import { citationSchema, citationSourceSchema } from "@wunderstack/shared";
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
  fund: z.string().min(1).optional(),
  topK: z.number().int().positive().max(50).default(5),
  minScore: z.number().min(0).max(1).default(0),
});

export type RetrievalInput = z.input<typeof retrievalInputSchema>;

/** The citation source shape is shared across seams (see @wunderstack/shared). */
export const retrievalSourceSchema = citationSourceSchema;

export const retrievalHitSchema = z.object({
  chunkId: z.string(),
  ordinal: z.number().int(),
  score: z.number(),
  title: z.string(),
});

export const retrievalOutputSchema = z.object({
  /** Prompt-ready context block, each passage prefixed with its `[ref]` + sourceRef. */
  context: z.string(),
  /** Deduplicated, citation-numbered sources (document level). */
  sources: z.array(retrievalSourceSchema),
  /** Per-chunk citations enriched with CAO structure (article/lid) + a snippet (Fase 11). */
  citations: z.array(citationSchema),
  /** Per-chunk hits (id + similarity score) — recorded on the Langfuse trace for observability. */
  hits: z.array(retrievalHitSchema),
});

export type RetrievalOutput = z.infer<typeof retrievalOutputSchema>;

/**
 * Run retrieval and shape it into the tool's output contract. Called directly by the agent in v1.
 */
export async function runRetrieval(input: RetrievalInput): Promise<RetrievalOutput> {
  const parsed = retrievalInputSchema.parse(input);
  const result = await retrieveContext({
    query: parsed.query,
    topK: parsed.topK,
    minScore: parsed.minScore,
    ...(parsed.fund === undefined ? {} : { fund: parsed.fund }),
  });

  return retrievalOutputSchema.parse({
    context: result.context,
    sources: result.sources,
    citations: result.citations,
    hits: result.chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      ordinal: chunk.ordinal,
      score: chunk.score,
      title: chunk.source.title,
    })),
  });
}
