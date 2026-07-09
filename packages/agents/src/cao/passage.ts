import { fetchParentPassage, type PassageInput, type PassageResult } from "@wunderstack/rag";

/**
 * Agent-seam wrapper for the "toon volledige passage" expansion. Apps call this instead of reaching
 * into @wunderstack/rag directly, keeping retrieval/DB access behind the package boundary.
 * The fund is enforced downstream (corpus isolation).
 */
export async function fetchPassage(input: PassageInput): Promise<PassageResult | null> {
  return fetchParentPassage(input);
}

export type { PassageInput, PassageResult };
