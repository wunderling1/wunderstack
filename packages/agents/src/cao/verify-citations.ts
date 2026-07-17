import type { ModelCitation } from "@wunderstack/shared";

/** Collapse whitespace for verbatim comparison (model vs chunk text). */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Resolve a chunk id against the content map, tolerating the article reference the model tends to
 * copy along with the id. The assembled context renders `chunk_id=<id> (Artikel 5.2) …`, and a small
 * model frequently folds that reference into the chunk_id — as `"<id> (Artikel 5.2)"`, `"<id> 5.2"`,
 * or `"<id> Artikel 5.2"` — which then misses the map keyed on the bare id. A real chunk id contains
 * no whitespace (fixture slugs and DB uuids), so the token before the first whitespace is the bare
 * id; the fallback lookup uses that. The quote still has to verify verbatim against the resolved
 * chunk, so a mis-resolution cannot pass a wrong quote. Returns the id that actually matched.
 */
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
  return undefined;
}

export interface VerifiedCitation extends ModelCitation {
  verified: boolean;
}

export interface CitationVerificationResult {
  verified: VerifiedCitation[];
  strippedMarkers: number[];
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

  for (const citation of modelCitations) {
    const resolved = resolveChunkContent(citation.chunkId, chunkContentById);
    if (!resolved) {
      strippedMarkers.push(citation.marker);
      continue;
    }
    const quoteNorm = normalizeWhitespace(citation.quote);
    const contentNorm = normalizeWhitespace(resolved.content);
    if (quoteNorm.length === 0 || !contentNorm.includes(quoteNorm)) {
      strippedMarkers.push(citation.marker);
      continue;
    }
    verified.push({ ...citation, chunkId: resolved.resolvedId, verified: true });
  }

  return {
    verified,
    strippedMarkers,
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
  return result.replace(/\s{2,}/g, " ").trim();
}
