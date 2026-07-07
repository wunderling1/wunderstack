import { z } from "zod";

/**
 * The single source of truth for a citation source — the deduplicated, citation-numbered document
 * a grounded answer attributes itself to. This same shape crosses several seams (retrieval output,
 * the agent contract, the chat API contract), so it lives here once and every layer infers from it
 * (see .cursor/rules/300-typescript.mdc: "één bron van waarheid per contract").
 */
export const citationSourceSchema = z.object({
  /** 1-based citation marker used as `[ref]` in the context and answer. */
  ref: z.number().int().positive(),
  title: z.string(),
  sourceUri: z.string(),
  fund: z.string(),
  version: z.string(),
});

export type CitationSource = z.infer<typeof citationSourceSchema>;

/**
 * A richer citation (Fase 11): a document-level source enriched with the CAO structure anchor
 * (chapter/article/lid + a human-readable `sourceRef`) and a short text snippet. This is what lets
 * the agent cite "Artikel 5, lid 2 [1]" and lets the UI (Fase 12) expand a citation to the real
 * CAO text. Multiple citations may share a `ref` when one document contributes several articles.
 */
export const citationSchema = citationSourceSchema.extend({
  /** Chapter number/label, null above chapter level. */
  chapter: z.string().nullable(),
  /** Article number ("5", "6a") or bijlage label ("Bijlage 1"), null when unknown. */
  article: z.string().nullable(),
  /** Lid (clause) number within the article, null at article level. */
  lid: z.string().nullable(),
  /** Human-readable citation anchor ("Artikel 5, lid 2"), null when no structure was detected. */
  sourceRef: z.string().nullable(),
  /** Short excerpt of the cited chunk, for a UI to show/expand. */
  snippet: z.string(),
});

export type Citation = z.infer<typeof citationSchema>;
