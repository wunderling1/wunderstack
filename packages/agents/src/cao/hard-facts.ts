/**
 * Hard-fact detection — the single source of truth for what counts as a "load-bearing" numeric
 * claim in a CAO answer. Load-bearing = money amounts (€), percentages, and quantities with a unit
 * (uur/weken/maanden/dagen/jaar/km/trede). These are exactly the facts an answer can fabricate:
 * a wrong salary, a wrong toeslag-percentage, an invented pro-rata number.
 *
 * This module is shared on purpose. Two callers must agree on "what is a hard fact":
 *   - the eval (`scoreHardHallucination`, Gate C), which flags any hard fact not grounded in context;
 *   - the production runtime guard (`verifyAndBuild` in agent.ts, E13), which refuses to serve a hard
 *     fact that survived with zero verified citations.
 * Keeping one regex set here prevents the guard and the gate from drifting apart.
 */

/**
 * Regexes for the three hard-fact families. All are global so `matchAll` can enumerate every hit;
 * `matchAll` does not mutate the shared regex's `lastIndex`, so reusing these module-level literals
 * across calls is safe.
 */
export const HARD_FACT_PATTERNS: RegExp[] = [
  /€\s?\d[\d.]*(?:,\d+)?/g,
  /\d+(?:,\d+)?\s?%/g,
  /\b\d+(?:,\d+)?\s?(?:uur|uren|week|weken|maand|maanden|dag|dagen|jaar|jaren|kilometer|km|trede|treden|periodiek|periodieke|periodieken)\b/gi,
];

/** Collapse a fact/context to a case- and whitespace-insensitive form for substring comparison. */
export function normalizeFact(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

/**
 * Extract every hard fact from `text`. Inline citation markers (`[n]`) are stripped first so a bare
 * reference number is never mistaken for a quantity (that concern is citation-correctness, not
 * hallucination).
 */
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

/** True when `text` asserts at least one hard fact. Used by the production runtime guard. */
export function containsHardFact(text: string): boolean {
  return extractHardFacts(text).length > 0;
}

/** Strip currency symbols so a bare table amount ("1.281,19") matches an answer's "€ 1.281,19". */
function stripCurrency(text: string): string {
  return text.replace(/€/g, "");
}

/** Leading numeric token of a hard fact ("58 jaar" -> "58", "€ 1.281,19" -> "1.281,19"). */
function numericCore(fact: string): string {
  const match = /\d[\d.,]*/.exec(fact);
  return match ? match[0].replace(/[.,]+$/, "") : "";
}

/**
 * Return the hard facts in `text` that do not literally appear in `grounding`. `grounding` is the
 * text the answer is allowed to lean on: the retrieved context, plus — for the eval — the user's own
 * question/history, because a number the user themselves supplied (e.g. "ik werk 24 uur") is a
 * premise, not a hallucination.
 *
 * Two precision rules beyond a raw substring match (both narrow, to avoid blinding the check to real
 * fabrications; this is the eval's grounding check, not the runtime guard, which uses
 * {@link containsHardFact}):
 *   - currency-insensitive for *formatted* amounts: a salary table lists "1.281,19" bare while the
 *     answer writes "€ 1.281,19". Only applied when the amount carries a separator, so bare round
 *     euro amounts stay strict.
 *   - user-supplied numbers: `userSupplied` numbers are premises, even when the answer pairs them
 *     with a unit the user left implicit ("ik ben 58" -> "58 jaar").
 */
export function findUngroundedFacts(text: string, grounding: string, userSupplied = ""): string[] {
  const groundingNorm = normalizeFact(grounding);
  const groundingNoCurrency = stripCurrency(groundingNorm);
  const userNumbers = new Set(
    [...userSupplied.matchAll(/\d[\d.,]*/g)].map((match) => match[0].replace(/[.,]+$/, "")),
  );

  const ungrounded: string[] = [];
  for (const fact of extractHardFacts(text)) {
    const factNorm = normalizeFact(fact);
    if (groundingNorm.includes(factNorm)) {
      continue;
    }
    const factNoCurrency = stripCurrency(factNorm);
    const isFormattedAmount = factNoCurrency !== factNorm && /[.,]/.test(factNoCurrency);
    if (isFormattedAmount && groundingNoCurrency.includes(factNoCurrency)) {
      continue;
    }
    const number = numericCore(fact);
    if (number.length > 0 && userNumbers.has(number)) {
      continue;
    }
    ungrounded.push(fact);
  }
  return ungrounded;
}
