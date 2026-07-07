import type { Citation, CitationSource } from "@wunderstack/shared";

import type { RetrievedChunk } from "./retrieve.js";

/**
 * Assemble step of the RAG pipeline: ranked chunks -> a context string + citation lists the agent
 * can attribute its answer to.
 *
 * Every passage carries a `[n]` reference tied to its source document. From Fase 10 chunks also
 * carry structure (chapter/article/lid), so the context now prefixes each passage with its
 * `sourceRef` ("Artikel 5, lid 2") and we emit a per-chunk `citations` list. That is what lets the
 * agent cite article + lid (Fase 11) and lets the UI expand a citation to the real CAO text.
 */

/** The document-level citation shape is shared across seams; see @wunderstack/shared. */
export type Source = CitationSource;

const SNIPPET_MAX_CHARS = 240;

export interface AssembledContext {
  /** Passages joined into a single prompt-ready block, each prefixed with its `[ref]` + sourceRef. */
  context: string;
  /** Deduplicated sources, one per document, in first-seen order. */
  sources: Source[];
  /** Per-chunk citations (structure + snippet), sharing the document's `[ref]`. */
  citations: Citation[];
  /** The ranked chunks this context was built from (kept for tracing/debugging). */
  chunks: RetrievedChunk[];
}

/** Collapse whitespace and clip to a readable snippet for the UI. */
function makeSnippet(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > SNIPPET_MAX_CHARS
    ? `${normalized.slice(0, SNIPPET_MAX_CHARS).trimEnd()}…`
    : normalized;
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

  const citations: Citation[] = [];
  const seenCitations = new Set<string>();
  for (const hit of chunks) {
    const ref = refByDocument.get(hit.source.documentId) ?? 0;
    const key = `${String(ref)}|${hit.structure.sourceRef ?? ""}`;
    if (seenCitations.has(key)) continue;
    seenCitations.add(key);
    citations.push({
      ref,
      title: hit.source.title,
      sourceUri: hit.source.sourceUri,
      fund: hit.source.fund,
      version: hit.source.version,
      chapter: hit.structure.chapter,
      article: hit.structure.article,
      lid: hit.structure.lid,
      sourceRef: hit.structure.sourceRef,
      snippet: makeSnippet(hit.content),
    });
  }

  const context = chunks
    .map((hit) => {
      const ref = String(refByDocument.get(hit.source.documentId) ?? 0);
      const anchor = hit.structure.sourceRef ? ` (${hit.structure.sourceRef})` : "";
      return `[${ref}]${anchor} ${hit.content.trim()}`;
    })
    .join("\n\n");

  return { context, sources, citations, chunks };
}
