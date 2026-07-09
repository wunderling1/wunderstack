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
 * A model-attested citation entry parsed from the generation sentinel block.
 * Each marker maps to exactly one chunk and a verbatim quote the model claims supports a fact.
 */
export const modelCitationSchema = z.object({
  marker: z.number().int().positive(),
  /** Chunk identifier the model copied from the context (a uuid in production; a slug in evals). */
  chunkId: z.string().min(1),
  quote: z.string().min(1),
});

export type ModelCitation = z.infer<typeof modelCitationSchema>;

/**
 * A verified citation shown in the UI: one `[ref]` → one chunk, with a model-attested quote that
 * passed verbatim verification and a snippet centred on that quote for display.
 */
export const citationSchema = citationSourceSchema.extend({
  /** The chunk this citation refers to (per-citation ref model). */
  chunkId: z.string().uuid(),
  /** Verbatim quote from the chunk, attested by the model and verified server-side. */
  quote: z.string(),
  /** Chapter number/label, null above chapter level. */
  chapter: z.string().nullable(),
  /** Article number ("5", "6a") or bijlage label ("Bijlage 1"), null when unknown. */
  article: z.string().nullable(),
  /** Lid (clause) number within the article, null at article level. */
  lid: z.string().nullable(),
  /** Human-readable citation anchor ("Artikel 5, lid 2"), null when no structure was detected. */
  sourceRef: z.string().nullable(),
  /** Card heading ("Artikel 12 — Vakantie") from structure or a content regex; null when unknown. */
  heading: z.string().nullable(),
  /** Short excerpt centred on `quote`, for the collapsed source card. */
  snippet: z.string(),
});

export type Citation = z.infer<typeof citationSchema>;
