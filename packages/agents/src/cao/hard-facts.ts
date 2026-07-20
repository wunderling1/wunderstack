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
  // Quantity + unit. `(?:[a-z]+-)*` lets a HYPHENATED compound noun sit between the number and its
  // base unit ("120 vakantie-uren", "15,2 verlof-uren"), and the explicit concatenated forms cover the
  // written-together variants ("48 vakantieuren", "20 vakantiedagen"). This closes the compound-unit
  // gap (golden-set.REVIEW.md §9/§14): a fabricated pro-rata TOTAL like "120 vakantie-uren" was invisible
  // because the number was not directly adjacent to "uren". The compound prefix is hyphen-only ON PURPOSE
  // — a bare `[a-z]*` would swallow words that merely END in a unit ("figuur", "natuur", "structuur"),
  // manufacturing phantom facts. Grounding tolerance for these compounds lives in `findUngroundedFacts`.
  /\b\d+(?:,\d+)?\s?(?:[a-z]+-)*(?:uur|uren|week|weken|maand|maanden|dag|dagen|jaar|jaren|kilometer|km|trede|treden|periodiek|periodieke|periodieken|vakantieuren|vakantiedagen|vakantiedag|verlofuren|verlofdagen|verlofdag)\b/gi,
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

/**
 * True when `text` asserts a load-bearing number that is NOT grounded in `grounding`. This is the
 * single decision shared by the retry trigger (`assessCitationContract`, generate-answer.ts) and the
 * production runtime guard (`verifyAndBuild`, agent.ts, E13); it mirrors the eval's hard-hallucination
 * scorer (judge.ts `scoreHardHallucination`), which already grounds against the retrieved context.
 * All three now answer the SAME question — "does the context carry this figure?" — instead of the
 * weaker "is there ANY verified citation?".
 *
 * This closes the "decorative citation" gap (etd-026): a quote that verifies verbatim
 * ("De Wet Arbeid en Zorg is van toepassing.") but does not carry the asserted figure ("16 weken").
 * A citation is proof, not decoration: a number is grounded only when it actually appears in the
 * context, regardless of what quote sits next to it.
 *
 * Grounding is the retrieved chunk content; `userSupplied` (the user's question + history) counts too,
 * because a number the user themselves put on the table is a premise, not a fabrication. Delegates to
 * {@link findUngroundedFacts} so the format-tolerance rules apply identically everywhere:
 * currency-insensitive formatted amounts, whitespace/percentage collapse, user-supplied numbers.
 *
 * Compound-unit quantities ARE covered (golden-set.REVIEW.md §14): a fabricated pro-rata total written
 * as a compound ("120 vakantie-uren") is flagged, while a grounded figure the answer merely re-phrases
 * as a compound ("190 vakantie-uren" for a context "190 uur vakantie") is grounded via the number +
 * base unit — see {@link findUngroundedFacts}. This is what stops the derived category (etd-d01/d02/d03)
 * from silently fabricating pro-rata totals past the guard.
 *
 * KNOWN LIMITATIONS (documented, not silent):
 *   - Written-out numbers are not normalized: a figure grounded only in words ("zestien weken") but
 *     asserted in digits ("16 weken"), or vice versa, reads as ungrounded and would over-flag.
 *   - Space-separated adjective+unit ("104 roostervrije uren") is NOT treated as a hard fact — the
 *     compound prefix is hyphen-only to avoid manufacturing phantom facts from words that end in a unit
 *     ("figuur", "structuur"). A fabricated space-separated adjective+unit would slip; the pro-rata
 *     fabrications that matter are hyphenated/concatenated compounds, which are caught.
 * Both are bounded by (a) the retry-first ordering — the model gets a repair turn before the guard
 * refuses — and (b) the eval's overRefusalRate ceiling, which watches the over-refusal side of the
 * trade. If a real corpus trips either, normalize/extend here rather than widen the gate.
 */
export function hasUngroundedHardFact(text: string, grounding: string, userSupplied = ""): boolean {
  return findUngroundedFacts(text, grounding, userSupplied).length > 0;
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
 * Base-unit families keyed by the suffix a (possibly compound) quantity ends in. "vakantie-uren" and
 * "vakantieuren" both end in "uren" -> the {uur, uren} family. Used to ground a compound-unit fact by
 * its number + base unit, tolerant of the compound noun in between.
 */
const UNIT_FAMILIES: { suffix: RegExp; variants: string[] }[] = [
  { suffix: /uren?$/i, variants: ["uur", "uren"] },
  { suffix: /dagen?$/i, variants: ["dag", "dagen"] },
  { suffix: /w(?:eek|eken)$/i, variants: ["week", "weken"] },
  { suffix: /maanden?$/i, variants: ["maand", "maanden"] },
  { suffix: /ja(?:ar|ren)$/i, variants: ["jaar", "jaren"] },
];

/**
 * True when a quantity fact is grounded via its number + base unit, ignoring an intervening compound
 * noun. A correct answer may phrase a grounded figure as a compound ("190 vakantie-uren") while the
 * context writes it plainly ("190 uur vakantie"); the raw compound string is then absent, but the fact
 * IS grounded. This checks only the number directly followed by a same-family base unit, so a fabricated
 * pro-rata total ("120 vakantie-uren" — 120 appears nowhere next to uur/uren) stays flagged. This is the
 * over-refusal guard for the compound-unit change (golden-set.REVIEW.md §14).
 */
function groundedByUnitFamily(fact: string, groundingNorm: string): boolean {
  const number = numericCore(fact);
  if (number.length === 0) {
    return false;
  }
  const factCollapsed = fact.replace(/\s+/g, "");
  const numberNorm = normalizeFact(number);
  for (const family of UNIT_FAMILIES) {
    if (family.suffix.test(factCollapsed)) {
      return family.variants.some((variant) => groundingNorm.includes(numberNorm + variant));
    }
  }
  return false;
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
    // Compound-unit fallback: a grounded number phrased as a compound ("190 vakantie-uren") is grounded
    // via its number + base unit, even though the exact compound string is absent from the context.
    if (groundedByUnitFamily(fact, groundingNorm)) {
      continue;
    }
    ungrounded.push(fact);
  }
  return ungrounded;
}
