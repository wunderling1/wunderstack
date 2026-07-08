import type { ModelCitation } from "@wunderstack/shared";

/** Collapse whitespace for verbatim comparison (model vs chunk text). */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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
    const content = chunkContentById.get(citation.chunkId);
    if (!content) {
      strippedMarkers.push(citation.marker);
      continue;
    }
    const quoteNorm = normalizeWhitespace(citation.quote);
    const contentNorm = normalizeWhitespace(content);
    if (quoteNorm.length === 0 || !contentNorm.includes(quoteNorm)) {
      strippedMarkers.push(citation.marker);
      continue;
    }
    verified.push({ ...citation, verified: true });
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
