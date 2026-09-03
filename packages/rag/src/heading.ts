import type { RetrievedChunk } from "./retrieve";

const HEADING_REGEX = /(?:Artikel|Hoofdstuk|Bijlage|Paragraaf)\s+[\w.]+(?:\s*[—–:-]\s*[^\n.;]{2,80})?/i;

/**
 * Card heading for a retrieved chunk. Prefers structure metadata (Fase 10), then a regex over the
 * chunk's opening text (pre-Fase-10 fallback), then the structural anchor. Returns null when no
 * article-level heading can be derived, so the UI falls back to the document title.
 *
 * Single source of truth for citation chips and progress labels — used by assemble placeholders and
 * buildVerifiedCitations in packages/agents.
 */
export function deriveChunkHeading(chunk: RetrievedChunk): string | null {
  const { article, lid, sourceRef } = chunk.structure;

  if (article) {
    const title = extractArticleTitle(chunk.content);
    const base = `Artikel ${article}`;
    const withLid = lid ? `${base}, lid ${lid}` : base;
    return title ? `${withLid} — ${title}` : withLid;
  }

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
