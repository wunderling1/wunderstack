import type { ModelCitation } from "@wunderstack/shared";

/** Collapse whitespace for verbatim comparison (model vs chunk text). */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Shortest a fragment of an ellipsis-elided quote may be and still count as grounded. Short spans
 * (a lone "50%", a stray "op:") match too easily to prove the model quoted the source rather than
 * coincidentally reused a common token, so a fragment below this length fails the whole quote.
 */
const MIN_ELLIPSIS_FRAGMENT_LEN = 8;

/**
 * Split a normalized quote on ellipsis markers; returns the trimmed, non-empty parts. Covers the bare
 * forms ("..." / "…") and the bracketed/parenthesised editorial forms models emit to signal an omission
 * ("[...]", "[…]", "(...)"). The surrounding bracket/paren is optional and only consumed when it hugs an
 * ellipsis, so a stray "[" or "(" elsewhere in the quote is left intact.
 */
function splitOnEllipsis(quoteNorm: string): string[] {
  return quoteNorm
    .split(/\s*[[(]?\s*(?:\.{3,}|…)\s*[\])]?\s*/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0);
}

/**
 * Is the model's quote grounded verbatim in the chunk?
 *
 * The strict case is a single contiguous substring (after whitespace normalization). The prompt asks
 * the model to quote one contiguous span and, when two spans are needed, to emit two citation objects
 * rather than stitch them with "…". Models nonetheless elide often enough — with a bare "…"/"..." or an
 * editorial "[...]"/"[…]" (even Mistral Large does this, golden-set.REVIEW.md §17 etd-010) — that a
 * genuinely-grounded citation gets stripped (baseline v4 etd-010/etd-018). Rather than weaken the
 * anti-fabrication guarantee, we accept an ellipsis quote ONLY when EVERY elided fragment is itself a
 * verbatim substring AND the fragments occur in the same order in the source. That keeps the property
 * that matters — every asserted span is real source text, nothing invented — while no longer
 * penalizing the model for dropping the connective middle. A fragment shorter than
 * {@link MIN_ELLIPSIS_FRAGMENT_LEN} is rejected so a trivial token cannot manufacture a match.
 *
 * Deliberate loosening of the verbatim contract, decided and logged in golden-set.REVIEW.md
 * (Gate C citation-verification, PLAN-v3 Fase 14.0 stap 3).
 */
function quoteIsGrounded(quoteNorm: string, contentNorm: string): boolean {
  if (quoteNorm.length === 0) {
    return false;
  }
  if (contentNorm.includes(quoteNorm)) {
    return true;
  }

  const fragments = splitOnEllipsis(quoteNorm);
  // Fewer than two fragments means there was no ellipsis to split on, so the whole-quote check above
  // already settled it: not grounded.
  if (fragments.length < 2) {
    return false;
  }

  let searchFrom = 0;
  for (const fragment of fragments) {
    if (fragment.length < MIN_ELLIPSIS_FRAGMENT_LEN) {
      return false;
    }
    const index = contentNorm.indexOf(fragment, searchFrom);
    if (index === -1) {
      return false;
    }
    searchFrom = index + fragment.length;
  }
  return true;
}

/**
 * Resolve a chunk id against the content map, tolerating the article reference the model tends to
 * copy along with the id. The assembled context renders `chunk_id=<id> (Artikel 5.2) …`, and a small
 * model frequently folds that reference into the chunk_id — as `"<id> (Artikel 5.2)"`, `"<id> 5.2"`,
 * or `"<id> Artikel 5.2"` — which then misses the map keyed on the bare id. A real chunk id contains
 * no whitespace (fixture slugs and DB uuids), so the token before the first whitespace is the bare
 * id; the fallback lookup uses that.
 *
 * Hyphen / whitespace / case-insensitive fallback (Gate C close-out, etd-021): when the bare id still
 * misses, normalize by stripping hyphens/whitespace and lowercasing, and resolve ONLY when that
 * normalized key maps to exactly one corpus id. An ambiguous normalized key refuses to resolve — a
 * wrong chunk must never silently match. The quote still has to verify verbatim against the resolved
 * chunk, so a mis-resolution cannot pass a wrong quote. Returns the id that actually matched.
 */
function normalizeChunkIdKey(id: string): string {
  return id.toLowerCase().replace(/[-\s]/g, "");
}

function resolveChunkContent(
  chunkId: string,
  chunkContentById: Map<string, string>,
): { content: string; resolvedId: string } | undefined {
  const direct = chunkContentById.get(chunkId);
  if (direct !== undefined) {
    return { content: direct, resolvedId: chunkId };
  }
  const bareId = chunkId.trim().split(/\s+/)[0] ?? "";
  if (bareId.length > 0 && bareId !== chunkId) {
    const viaBare = chunkContentById.get(bareId);
    if (viaBare !== undefined) {
      return { content: viaBare, resolvedId: bareId };
    }
  }

  // Collision-safe normalized lookup (hyphen / whitespace / case). Built lazily per call — the map
  // is small (topK hits) and this path only runs on a miss.
  const candidates = bareId.length > 0 ? [chunkId, bareId] : [chunkId];
  for (const candidate of candidates) {
    const key = normalizeChunkIdKey(candidate);
    if (key.length === 0) {
      continue;
    }
    const matches: string[] = [];
    for (const id of chunkContentById.keys()) {
      if (normalizeChunkIdKey(id) === key) {
        matches.push(id);
      }
    }
    if (matches.length === 1) {
      const resolvedId = matches[0];
      if (resolvedId === undefined) {
        continue;
      }
      const content = chunkContentById.get(resolvedId);
      if (content === undefined) {
        continue;
      }
      return { content, resolvedId };
    }
  }
  return undefined;
}

export interface VerifiedCitation extends ModelCitation {
  verified: boolean;
}

export interface CitationVerificationResult {
  verified: VerifiedCitation[];
  strippedMarkers: number[];
  /** The citations that failed verification, kept whole so a repair turn can echo the exact quotes. */
  strippedCitations: ModelCitation[];
  allVerified: boolean;
}

/**
 * Assert each quote appears verbatim (after whitespace normalization) in the matching chunk content.
 * Failed citations are stripped; their markers are returned for optional answer cleanup.
 */
export function verifyCitations(
  modelCitations: ModelCitation[],
  chunkContentById: Map<string, string>,
): CitationVerificationResult {
  const verified: VerifiedCitation[] = [];
  const strippedMarkers: number[] = [];
  const strippedCitations: ModelCitation[] = [];

  for (const citation of modelCitations) {
    const resolved = resolveChunkContent(citation.chunkId, chunkContentById);
    if (!resolved) {
      strippedMarkers.push(citation.marker);
      strippedCitations.push(citation);
      continue;
    }
    // Case-folded verbatim comparison (golden-set.REVIEW.md §20, etd-002): the model naturally
    // capitalizes the first letter when it starts a quote mid-sentence ("Een extra vakantiedag…" for
    // source "…krijgt een extra vakantiedag…"), so a genuinely-grounded quote fails on one capital.
    // Lowercasing both sides normalizes letter-case only — every character must still be present in
    // order, and numbers/amounts/percentages are case-invariant — so this is formatting normalization,
    // not a weakening of the anti-fabrication guarantee (same category as whitespace/ellipsis/chunk-id).
    const quoteNorm = normalizeWhitespace(citation.quote).toLowerCase();
    const contentNorm = normalizeWhitespace(resolved.content).toLowerCase();
    if (!quoteIsGrounded(quoteNorm, contentNorm)) {
      strippedMarkers.push(citation.marker);
      strippedCitations.push(citation);
      continue;
    }
    verified.push({ ...citation, chunkId: resolved.resolvedId, verified: true });
  }

  return {
    verified,
    strippedMarkers,
    strippedCitations,
    allVerified: strippedMarkers.length === 0 && modelCitations.length > 0,
  };
}

/** Remove `[n]` markers for citations that failed verification. */
export function stripFailedMarkers(answer: string, markers: number[]): string {
  return stripMarkers(answer, markers);
}

/** Keep only markers that still have a verified citation behind them. */
export function stripUnverifiedMarkers(answer: string, verifiedMarkers: number[]): string {
  const referenced = [...answer.matchAll(/\[(\d+)\]/g)]
    .map((match) => Number(match[1]))
    .filter((marker) => Number.isInteger(marker) && marker > 0);
  const allowed = new Set(verifiedMarkers);
  const disallowed = [...new Set(referenced.filter((marker) => !allowed.has(marker)))];
  return stripMarkers(answer, disallowed);
}

function stripMarkers(answer: string, markers: number[]): string {
  if (markers.length === 0) {
    return answer;
  }
  let result = answer;
  for (const marker of markers) {
    result = result.replaceAll(`[${String(marker)}]`, "");
  }
  return result
    .replace(/[ \t]+\n/g, "\n")
    .replace(/(?<=\S) {2,}/g, " ")
    .replace(/ +([.,;:])/g, "$1")
    .trim();
}
