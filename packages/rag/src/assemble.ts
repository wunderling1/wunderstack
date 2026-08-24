import type { Citation } from "@wunderstack/shared";

import type { RetrievedChunk } from "./retrieve.js";

export interface RetrievalTimings {
  rewriteMs: number;
  embedMs: number;
  searchMs: number;
  rerankMs: number;
  totalMs: number;
}

/**
 * Assemble step of the RAG pipeline: ranked chunks -> a context string + chunk-indexed passages.
 *
 * Each retrieved chunk gets its own `[n]` marker and `chunk_id=` anchor so the model can cite
 * exactly one passage per marker. Citations for the UI are built later from model-attested quotes
 * (see packages/agents/src/runtime/build-citations.ts).
 */

const SNIPPET_MAX_CHARS = 240;

export interface AssembledContext {
  /** Passages joined into a prompt-ready block, each prefixed with its `[ref]` + chunk id + sourceRef. */
  context: string;
  /** Per-chunk citations (pre-verification placeholders; filtered after generation). */
  citations: Citation[];
  /** The ranked chunks this context was built from (kept for tracing and citation verification). */
  chunks: RetrievedChunk[];
  /** Per-phase wall-clock timings for Langfuse latency budgets. */
  timings: RetrievalTimings;
}

/** Collapse whitespace and clip to a readable snippet for pre-generation placeholders. */
function makeSnippet(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > SNIPPET_MAX_CHARS
    ? `${normalized.slice(0, SNIPPET_MAX_CHARS).trimEnd()}…`
    : normalized;
}

export function assemble(chunks: RetrievedChunk[], timings: RetrievalTimings): AssembledContext {
  const citations: Citation[] = chunks.map((hit, index) => {
    const ref = index + 1;
    return {
      ref,
      chunkId: hit.chunkId,
      quote: "",
      title: hit.source.title,
      sourceUri: hit.source.sourceUri,
      fund: hit.source.fund,
      version: hit.source.version,
      chapter: hit.structure.chapter,
      article: hit.structure.article,
      lid: hit.structure.lid,
      sourceRef: hit.structure.sourceRef,
      heading: hit.structure.sourceRef,
      snippet: makeSnippet(hit.content),
    };
  });

  const context = chunks
    .map((hit, index) => {
      const ref = index + 1;
      const anchor = hit.structure.sourceRef ? ` (${hit.structure.sourceRef})` : "";
      return `[${String(ref)}] chunk_id=${hit.chunkId}${anchor} ${hit.content.trim()}`;
    })
    .join("\n\n");

  return { context, citations, chunks, timings };
}
