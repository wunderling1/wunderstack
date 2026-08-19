import { rewriteQuery, type RewriteResult, type QueryExpansion } from "@wunderstack/rag";

/** Arbo glossary — no CAO jargon (ORT, ADV, fg N). */
export const ARBO_QUERY_EXPANSIONS: QueryExpansion[] = [
  { pattern: /\bPBM\b/i, term: "persoonlijke beschermingsmiddelen" },
  { pattern: /\bRI&E\b/i, term: "risico-inventarisatie en -evaluatie" },
  { pattern: /\bBHV\b/i, term: "bedrijfshulpverlening" },
  { pattern: /\btillen\b/i, term: "fysieke belasting tillen" },
  { pattern: /\bgevaarlijke stoffen\b/i, term: "chemische stoffen blootstelling" },
  { pattern: /\bbeeldschermwerk\b/i, term: "beeldschermwerkplek" },
  // Spoken/shop-floor wording for the EV catalog (NEN 9140): "ev" and "leerling is 16"
  // never appear as those tokens — the source says e-voertuig / jongeren onder de 18 / leek.
  { pattern: /\bEV\b/i, term: "e-voertuig elektrisch voertuig HV-systeem" },
  { pattern: /\b(?:leerling(?:en)?|stagiair(?:e|s|es)?)\b/i, term: "jongeren onder de 18 jaar leek" },
  { pattern: /\b(?:16|17)(?:-|\s*)?(?:jaar|jarige)?\b/i, term: "jongeren onder de 18 jaar leek" },
];

export function rewriteArboQuery(query: string): RewriteResult {
  return rewriteQuery(query, ARBO_QUERY_EXPANSIONS);
}
