/**
 * Query rewriting (Fase 10) — normalize CAO jargon/abbreviations before embedding.
 *
 * CAO questions are full of abbreviations ("ORT", "ADV", "fg 3") that an embedding model handles
 * worse than the spelled-out term. We enrich the query by APPENDING the expanded terms rather than
 * replacing anything, so the rewrite is non-destructive by construction: no original signal is
 * lost, only relevant vocabulary is added.
 *
 * This is a deliberate deterministic seam (no LLM on the hot path): it is cheap, traceable and
 * testable. An LLM-based rewrite can slot in behind `rewriteQuery` later if a real corpus proves
 * it worthwhile (regel van drie).
 */

export interface RewriteResult {
  original: string;
  /** The query fed to the embedder: original text plus any appended expansions. */
  rewritten: string;
  /** Expansions that were appended (for tracing). */
  expansions: string[];
}

export interface QueryExpansion {
  pattern: RegExp;
  term: string;
}

const DEFAULT_CAO_EXPANSIONS: QueryExpansion[] = [
  { pattern: /\bORT\b/i, term: "onregelmatigheidstoeslag" },
  { pattern: /\bADV\b/i, term: "arbeidsduurverkorting" },
  { pattern: /\bWTW\b/i, term: "werktijdenverkorting" },
  { pattern: /\bIKB\b/i, term: "individueel keuzebudget" },
  { pattern: /\bBHV\b/i, term: "bedrijfshulpverlening" },
  { pattern: /\bOR\b/, term: "ondernemingsraad" },
  { pattern: /\bO&O\b/i, term: "opleidings- en ontwikkelingsfonds" },
  { pattern: /\b(?:fg|FG)\s?\d/i, term: "functiegroep" },
  { pattern: /\bfunctieschaal\b/i, term: "salarisschaal" },
  { pattern: /\bvakantiegeld\b/i, term: "vakantietoeslag" },
  { pattern: /\b13e maand\b/i, term: "eindejaarsuitkering" },
  { pattern: /\bdertiende maand\b/i, term: "eindejaarsuitkering" },
  { pattern: /\breiskosten\b/i, term: "reiskostenvergoeding woon-werkverkeer" },
  { pattern: /\bproeftijd\b/i, term: "proeftijd arbeidsovereenkomst" },
];

/** True when `term` (as a whole word) already appears in `query`, so we do not append duplicates. */
function alreadyPresent(query: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(query);
}

export function rewriteQuery(query: string, expansions: QueryExpansion[] = DEFAULT_CAO_EXPANSIONS): RewriteResult {
  const trimmed = query.trim();
  const matched: string[] = [];

  for (const { pattern, term } of expansions) {
    if (pattern.test(trimmed) && !alreadyPresent(trimmed, term) && !matched.includes(term)) {
      matched.push(term);
    }
  }

  const rewritten = matched.length > 0 ? `${trimmed} (${matched.join(", ")})` : trimmed;

  return { original: query, rewritten, expansions: matched };
}
