/**
 * Hard-fact detection for arbocatalogus answers: physical limits and safety thresholds.
 */

export const HARD_FACT_PATTERNS: RegExp[] = [
  /\b\d+(?:[.,]\d+)?\s?(?:kg|kilogram|kilogrammen)\b/gi,
  /\b\d+(?:[.,]\d+)?\s?(?:dB|decibel)\b/gi,
  /\b\d+(?:[.,]\d+)?\s?ppm\b/gi,
  /\b\d+(?:[.,]\d+)?\s?°C\b/g,
  /\b\d+(?:[.,]\d+)?\s?(?:uur|uren|dag|dagen|week|weken|maand|maanden|jaar|jaren)\b/gi,
];

export function normalizeFact(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

export function extractHardFacts(text: string): string[] {
  const withoutCitations = text.replace(/\[\d+\]/g, " ");
  const facts: string[] = [];
  for (const pattern of HARD_FACT_PATTERNS) {
    for (const match of withoutCitations.matchAll(pattern)) {
      facts.push(match[0].trim());
    }
  }
  return facts;
}

export function containsHardFact(text: string): boolean {
  return extractHardFacts(text).length > 0;
}

export function hasUngroundedHardFact(text: string, grounding: string, userSupplied = ""): boolean {
  return findUngroundedFacts(text, grounding, userSupplied).length > 0;
}

/** Leading numeric token of a hard fact ("16 jaar" → "16"). */
function numericCore(fact: string): string {
  const match = /\d[\d.,]*/.exec(fact);
  return match ? match[0].replace(/[.,]+$/, "") : "";
}

export function findUngroundedFacts(text: string, grounding: string, userSupplied = ""): string[] {
  const normalizedGrounding = normalizeFact(`${grounding} ${userSupplied}`);
  const userNumbers = new Set(
    [...userSupplied.matchAll(/\d[\d.,]*/g)].map((match) => match[0].replace(/[.,]+$/, "")),
  );
  return extractHardFacts(text).filter((fact) => {
    if (normalizedGrounding.includes(normalizeFact(fact))) {
      return false;
    }
    // A number the user already stated is a premise, even when the answer adds an implicit unit
    // ("mijn leerling is 16" → "16 jaar"). Same rule as cao/hard-facts.ts.
    const number = numericCore(fact);
    return !(number.length > 0 && userNumbers.has(number));
  });
}
