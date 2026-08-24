/**
 * Arbo hard-fact detection — thin binding of the shared module to agentKey `"arbo"`.
 * Implementation lives in `../hard-facts.ts` so the eval judge and this runtime guard cannot drift.
 */
export {
  ARBO_HARD_FACT_PATTERNS as HARD_FACT_PATTERNS,
  normalizeFact,
} from "../hard-facts.js";

import {
  containsHardFact as sharedContains,
  extractHardFacts as sharedExtract,
  findUngroundedFacts as sharedFind,
  hasUngroundedHardFact as sharedHasUngrounded,
} from "../hard-facts.js";

export function extractHardFacts(text: string): string[] {
  return sharedExtract(text, "arbo");
}

export function containsHardFact(text: string): boolean {
  return sharedContains(text, "arbo");
}

export function hasUngroundedHardFact(text: string, grounding: string, userSupplied = ""): boolean {
  return sharedHasUngrounded(text, grounding, userSupplied, "arbo");
}

export function findUngroundedFacts(text: string, grounding: string, userSupplied = ""): string[] {
  return sharedFind(text, grounding, userSupplied, "arbo");
}
