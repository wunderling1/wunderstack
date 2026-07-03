import type { RetrievedChunk } from "./retrieve.js";

/**
 * Assemble step of the RAG pipeline: ranked chunks -> a context string + a deduplicated source
 * list the agent can cite. Every passage carries a `[n]` reference tied to its source document,
 * so the CAO-agent (Fase 6) can attribute its answer and stay traceable.
 */

export interface Source {
  /** Stable 1-based citation marker used as `[ref]` in the context. */
  ref: number;
  title: string;
  sourceUri: string;
  fund: string;
  version: string;
}

export interface AssembledContext {
  /** Passages joined into a single prompt-ready block, each prefixed with its `[ref]`. */
  context: string;
  /** Deduplicated sources, one per document, in first-seen order. */
  sources: Source[];
  /** The ranked chunks this context was built from (kept for tracing/debugging). */
  chunks: RetrievedChunk[];
}

export function assemble(chunks: RetrievedChunk[]): AssembledContext {
  const sources: Source[] = [];
  const refByDocument = new Map<string, number>();

  for (const hit of chunks) {
    if (!refByDocument.has(hit.source.documentId)) {
      const ref = sources.length + 1;
      refByDocument.set(hit.source.documentId, ref);
      sources.push({
        ref,
        title: hit.source.title,
        sourceUri: hit.source.sourceUri,
        fund: hit.source.fund,
        version: hit.source.version,
      });
    }
  }

  const context = chunks
    .map((hit) => `[${String(refByDocument.get(hit.source.documentId) ?? 0)}] ${hit.content.trim()}`)
    .join("\n\n");

  return { context, sources, chunks };
}
