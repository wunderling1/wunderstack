import { normalizeWhitespace } from "./verify-citations";

const SNIPPET_MAX_CHARS = 320;
const CONTEXT_SENTENCES = 2;

/** Sentence boundary for Dutch/legal text (period, semicolon, or newline). */
const SENTENCE_END = /[.!?;]\s+/;

/**
 * Build a readable snippet centred on a verified quote, trimmed to sentence boundaries.
 */
export function buildQuoteSnippet(fullContent: string, quote: string): string {
  const content = fullContent.replace(/\s+/g, " ").trim();
  const quoteNorm = normalizeWhitespace(quote);
  if (quoteNorm.length === 0) {
    return clipToSentenceBoundary(content, SNIPPET_MAX_CHARS);
  }

  const quoteIndex = normalizeWhitespace(content).indexOf(quoteNorm);
  if (quoteIndex === -1) {
    return clipToSentenceBoundary(content, SNIPPET_MAX_CHARS);
  }

  const before = content.slice(0, quoteIndex);
  const after = content.slice(quoteIndex + quote.length);

  let start = findSentenceStart(before, CONTEXT_SENTENCES);
  const end = quoteIndex + quote.length + findSentenceEnd(after, CONTEXT_SENTENCES);

  let snippet = content.slice(start, end).trim();
  if (snippet.length > SNIPPET_MAX_CHARS) {
    // Prefer keeping the quote visible: centre the window on the quote.
    const quoteStartInSnippet = snippet.indexOf(quote.trim());
    if (quoteStartInSnippet >= 0) {
      const half = Math.floor((SNIPPET_MAX_CHARS - quote.length) / 2);
      start = Math.max(0, quoteStartInSnippet - half);
      snippet = clipToSentenceBoundary(snippet.slice(start), SNIPPET_MAX_CHARS);
    } else {
      snippet = clipToSentenceBoundary(snippet, SNIPPET_MAX_CHARS);
    }
  }

  return snippet;
}

function findSentenceStart(before: string, maxSentences: number): number {
  let pos = before.length;
  let found = 0;
  while (pos > 0 && found < maxSentences) {
    const slice = before.slice(0, pos);
    const match = /[.!?;]\s+/.exec(slice);
    if (!match || match.index === undefined) {
      break;
    }
    pos = match.index + match[0].length;
    found++;
  }
  return found > 0 ? pos : 0;
}

function findSentenceEnd(after: string, maxSentences: number): number {
  let pos = 0;
  let found = 0;
  while (pos < after.length && found < maxSentences) {
    const slice = after.slice(pos);
    const match = SENTENCE_END.exec(slice);
    if (!match || match.index === undefined) {
      return after.length;
    }
    pos += match.index + match[0].length;
    found++;
  }
  return pos;
}

function clipToSentenceBoundary(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const clipped = normalized.slice(0, maxChars);
  const lastSentence = /.*[.!?;]\s/.exec(clipped);
  if (lastSentence?.[0]) {
    return `${lastSentence[0].trimEnd()}…`;
  }
  return `${clipped.trimEnd()}…`;
}

/**
 * Wrap the verified quote in a `<mark>` for UI rendering (caller must escape HTML if needed).
 */
export function highlightQuoteInSnippet(snippet: string, quote: string): string {
  const quoteTrimmed = quote.trim();
  if (quoteTrimmed.length === 0) {
    return snippet;
  }
  const index = snippet.indexOf(quoteTrimmed);
  if (index === -1) {
    // Try normalized match
    const snippetNorm = normalizeWhitespace(snippet);
    const quoteNorm = normalizeWhitespace(quote);
    const normIndex = snippetNorm.indexOf(quoteNorm);
    if (normIndex === -1) {
      return snippet;
    }
    // Best-effort: highlight the quote text as-is in snippet
    return snippet.replace(quoteNorm, `<mark>${quoteNorm}</mark>`);
  }
  return `${snippet.slice(0, index)}<mark>${quoteTrimmed}</mark>${snippet.slice(index + quoteTrimmed.length)}`;
}
