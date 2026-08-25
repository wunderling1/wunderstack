/**
 * Shared retrieval I/O shapes for grounded agents. Agent-neutral types that previously lived next
 * to the CAO tools module for historical reasons — behaviour (runRetrieval) stays per agent.
 */

import type { RetrievedChunk } from "@wunderstack/rag";
import { citationSchema } from "@wunderstack/shared";
import { z } from "zod";

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
