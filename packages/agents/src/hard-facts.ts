/**
 * Hard-fact detection — single source of truth for load-bearing numeric claims, keyed by agent.
 *
 * Two callers must agree on "what is a hard fact" per agent:
 *   - the eval (`scoreHardHallucination`), which flags any hard fact not grounded in context;
 *   - the production runtime guard (`verifyAndBuild`), which refuses to serve an ungrounded hard fact.
 * Keeping one regex set per agentKey prevents the guard and the gate from drifting apart.
 *
 * CAO: money (€), percentages, quantities with labour-law units.
 * Arbo: physical limits (kg, dB, ppm, °C) and time quantities.
 *
 * Agent keys come from {@link GroundedAgentKey} in the runtime registry — adding an agent without
 * patterns here is a compile error (`Record<GroundedAgentKey, …>`). Agents without retrieval
 * (roleplay) never reach this module: they make no grounded claims to verify.
 */

import { type GroundedAgentKey, isGroundedAgentKey } from "./runtime/registry.js";

/** @deprecated Prefer {@link GroundedAgentKey}; alias kept for eval/judge call-sites. */
export type HardFactAgentKey = GroundedAgentKey;

/** CAO hard-fact families. Global so `matchAll` can enumerate; safe to reuse across calls. */
export const CAO_HARD_FACT_PATTERNS: RegExp[] = [
  /€\s?\d[\d.]*(?:,\d+)?/g,
  /\d+(?:,\d+)?\s?%/g,
  // Quantity + unit. `(?:[a-z]+-)*` lets a HYPHENATED compound noun sit between the number and its
  // base unit ("120 vakantie-uren"). Bare `[a-z]*` would swallow words that merely END in a unit.
  /\b\d+(?:,\d+)?\s?(?:[a-z]+-)*(?:uur|uren|week|weken|maand|maanden|dag|dagen|jaar|jaren|kilometer|km|trede|treden|periodiek|periodieke|periodieken|vakantieuren|vakantiedagen|vakantiedag|verlofuren|verlofdagen|verlofdag)\b/gi,
];

/** Arbocatalogus hard-fact families: physical limits and safety thresholds. */
export const ARBO_HARD_FACT_PATTERNS: RegExp[] = [
  /\b\d+(?:[.,]\d+)?\s?(?:kg|kilogram|kilogrammen)\b/gi,
  /\b\d+(?:[.,]\d+)?\s?(?:dB|decibel)\b/gi,
  /\b\d+(?:[.,]\d+)?\s?ppm\b/gi,
  /\b\d+(?:[.,]\d+)?\s?°C\b/g,
  /\b\d+(?:[.,]\d+)?\s?(?:uur|uren|dag|dagen|week|weken|maand|maanden|jaar|jaren)\b/gi,
];

const HARD_FACT_PATTERNS_BY_AGENT: Record<GroundedAgentKey, RegExp[]> = {
  cao: CAO_HARD_FACT_PATTERNS,
  arbo: ARBO_HARD_FACT_PATTERNS,
};

export function patternsFor(agentKey: HardFactAgentKey): RegExp[] {
  return HARD_FACT_PATTERNS_BY_AGENT[agentKey];
}

export function resolveHardFactAgentKey(agentKey: string): HardFactAgentKey {
  if (!isGroundedAgentKey(agentKey)) {
    throw new Error(`Unknown agent key for hard-fact patterns: ${agentKey}`);
  }
  return agentKey;
}

/** Collapse a fact/context to a case- and whitespace-insensitive form for substring comparison. */
export function normalizeFact(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

export function extractHardFacts(text: string, agentKey: HardFactAgentKey = "cao"): string[] {
  const withoutCitations = text.replace(/\[\d+\]/g, " ");
  const facts: string[] = [];
  for (const pattern of patternsFor(agentKey)) {
    for (const match of withoutCitations.matchAll(pattern)) {
      facts.push(match[0].trim());
    }
  }
  return facts;
}

export function containsHardFact(text: string, agentKey: HardFactAgentKey = "cao"): boolean {
  return extractHardFacts(text, agentKey).length > 0;
}

export function hasUngroundedHardFact(
  text: string,
  grounding: string,
  userSupplied = "",
  agentKey: HardFactAgentKey = "cao",
): boolean {
  return findUngroundedFacts(text, grounding, userSupplied, agentKey).length > 0;
}

function stripCurrency(text: string): string {
  return text.replace(/€/g, "");
}

function numericCore(fact: string): string {
  const match = /\d[\d.,]*/.exec(fact);
  return match ? match[0].replace(/[.,]+$/, "") : "";
}

const UNIT_FAMILIES: { suffix: RegExp; variants: string[] }[] = [
  { suffix: /uren?$/i, variants: ["uur", "uren"] },
  { suffix: /dagen?$/i, variants: ["dag", "dagen"] },
  { suffix: /w(?:eek|eken)$/i, variants: ["week", "weken"] },
  { suffix: /maanden?$/i, variants: ["maand", "maanden"] },
  { suffix: /ja(?:ar|ren)$/i, variants: ["jaar", "jaren"] },
];

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
 * Return the hard facts in `text` that do not literally appear in `grounding`.
 * Shared grounding rules (currency strip, user-supplied numbers, compound-unit family) apply to
 * every agent — only the extraction patterns differ by `agentKey`.
 */
export function findUngroundedFacts(
  text: string,
  grounding: string,
  userSupplied = "",
  agentKey: HardFactAgentKey = "cao",
): string[] {
  const groundingNorm = normalizeFact(grounding);
  const groundingNoCurrency = stripCurrency(groundingNorm);
  const userNumbers = new Set(
    [...userSupplied.matchAll(/\d[\d.,]*/g)].map((match) => match[0].replace(/[.,]+$/, "")),
  );

  const ungrounded: string[] = [];
  for (const fact of extractHardFacts(text, agentKey)) {
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
    if (groundedByUnitFamily(fact, groundingNorm)) {
      continue;
    }
    ungrounded.push(fact);
  }
  return ungrounded;
}
