import type { Citation, ModelCitation } from "@wunderstack/shared";

import type { RetrievedChunk } from "@wunderstack/rag";
import { buildQuoteSnippet } from "./snippet.js";
import type { VerifiedCitation } from "./verify-citations.js";

/**
 * Merge verified model citations with retrieval chunk metadata into UI-ready citations.
 * Only cited chunks are included; each `[ref]` maps to exactly one citation card.
 */
export function buildVerifiedCitations(
  verified: VerifiedCitation[],
  chunks: RetrievedChunk[],
): Citation[] {
  const chunkById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));

  return verified
    .slice()
    .sort((a, b) => a.marker - b.marker)
    .map((modelCitation) => {
      const chunk = chunkById.get(modelCitation.chunkId);
      if (!chunk) {
        throw new Error(`Verified citation references unknown chunk ${modelCitation.chunkId}`);
      }
      return {
        ref: modelCitation.marker,
        chunkId: modelCitation.chunkId,
        quote: modelCitation.quote,
        title: chunk.source.title,
        sourceUri: chunk.source.sourceUri,
        fund: chunk.source.fund,
        version: chunk.source.version,
        chapter: chunk.structure.chapter,
        article: chunk.structure.article,
        lid: chunk.structure.lid,
        sourceRef: chunk.structure.sourceRef,
        heading: deriveHeading(chunk),
        snippet: buildQuoteSnippet(chunk.content, modelCitation.quote),
      };
    });
}

const HEADING_REGEX = /(?:Artikel|Hoofdstuk|Bijlage|Paragraaf)\s+[\w.]+(?:\s*[—–:-]\s*[^\n.;]{2,80})?/i;

/**
 * Card heading for a source. Prefers structure metadata (Fase 10), then a regex over the chunk's
 * opening text (pre-Fase-10 fallback, plan Fase C step 2), then the structural anchor. Returns null
 * when no article-level heading can be derived, so the UI falls back to the document title.
 */
function deriveHeading(chunk: RetrievedChunk): string | null {
  const { article, lid, sourceRef } = chunk.structure;

  // Best case: structured article/lid plus an article title if we can find one in the content.
  if (article) {
    const title = extractArticleTitle(chunk.content);
    const base = `Artikel ${article}`;
    const withLid = lid ? `${base}, lid ${lid}` : base;
    return title ? `${withLid} — ${title}` : withLid;
  }

  // Pre-Fase-10 fallback: a leading "Artikel X — Titel" / "Hoofdstuk ..." line in the chunk text.
  const head = chunk.content.slice(0, 160);
  const match = HEADING_REGEX.exec(head);
  if (match) {
    return match[0].replace(/\s+/g, " ").trim();
  }

  return sourceRef;
}

/** Pull the article title ("Vakantie") out of a "... — Vakantie" / "(Vakantie)" opening, if present. */
function extractArticleTitle(content: string): string | null {
  const head = content.slice(0, 160);
  const dash = /(?:Artikel|Bijlage)\s+[\w.]+\s*[—–:-]\s*([^\n.;]{2,80})/i.exec(head);
  if (dash?.[1]) {
    return dash[1].replace(/\s+/g, " ").trim();
  }
  const paren = /(?:Artikel|Bijlage)\s+[\w.]+\s*\(([^)]{2,80})\)/i.exec(head);
  if (paren?.[1]) {
    return paren[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

/** Extract markers referenced in the answer text. */
export function extractCitationMarkers(answer: string): number[] {
  const refs = new Set<number>();
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const ref = Number(match[1]);
    if (Number.isInteger(ref) && ref > 0) {
      refs.add(ref);
    }
  }
  return [...refs].sort((a, b) => a - b);
}

/** Orphan rate: citations shown without a matching `[n]` in the answer (should be 0). */
export function orphanSourceRate(answer: string, citations: Citation[]): number {
  if (citations.length === 0) {
    return 0;
  }
  const markers = new Set(extractCitationMarkers(answer));
  const orphans = citations.filter((c) => !markers.has(c.ref)).length;
  return orphans / citations.length;
}

export type { ModelCitation };
