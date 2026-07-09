import { z } from "zod";

/**
 * Contract for the "toon volledige passage" endpoint: given a citation's chunk id and a fund, return
 * the full parent passage (article unit, or an ordinal-window approximation before Fase 10).
 */
export const passageRequestSchema = z.object({
  chunkId: z.string().uuid(),
  /** Optional fund; authorized + defaulted server-side (corpus isolation). */
  fund: z.string().min(1).max(200).optional(),
});

export type PassageRequest = z.infer<typeof passageRequestSchema>;

export const passageResponseSchema = z.object({
  text: z.string(),
  approximate: z.boolean(),
  article: z.string().nullable(),
  chapter: z.string().nullable(),
  sourceRef: z.string().nullable(),
  title: z.string(),
  sourceUri: z.string(),
  fund: z.string(),
  version: z.string(),
});

export type PassageResponse = z.infer<typeof passageResponseSchema>;
