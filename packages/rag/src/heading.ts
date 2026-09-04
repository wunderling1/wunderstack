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

/** Chip / progress label for a chunk: article heading when we have one, otherwise the document title. */
export function passageLabel(chunk: RetrievedChunk): string {
  return deriveChunkHeading(chunk) ?? chunk.source.title;
}

/**
 * Key for uniqueness — untitled chunks keep distinct ids so sparse corpora do not collapse to one
 * document title. Display still uses {@link passageLabel}.
 */
export function passageUniquenessKey(chunk: RetrievedChunk): string {
  return deriveChunkHeading(chunk) ?? chunk.chunkId;
}

/**
 * First chunk per uniqueness key, in caller order. Retrieval lists are score-desc, so the kept
 * representative is the highest-scoring chunk of that heading (or each untitled chunk).
 */
export function uniqueByPassageLabel(chunks: readonly RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const unique: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    const key = passageUniquenessKey(chunk);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(chunk);
  }
  return unique;
}

/**
 * Unique headings above minScore, plus unique below-threshold headings that are not already in
 * that set. Dual-query merges happen before this — do not sum per-query lists.
 */
export function uniquePassageWindow(
  aboveThreshold: readonly RetrievedChunk[],
  dropped: readonly RetrievedChunk[],
): { found: RetrievedChunk[]; dropped: RetrievedChunk[] } {
  const found = uniqueByPassageLabel(aboveThreshold);
  const foundKeys = new Set(found.map(passageUniquenessKey));
  const uniqueDropped = uniqueByPassageLabel(dropped).filter(
    (chunk) => !foundKeys.has(passageUniquenessKey(chunk)),
  );
  return { found, dropped: uniqueDropped };
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
