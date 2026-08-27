import { z } from "zod";

/**
 * Local mirrors of the runtime contracts (Fase 4). The embed cannot import @wunderstack/shared (it
 * parses process.env at import — server-only) nor the runtime's app-local contract (package → app is
 * forbidden). These are the minimal shapes the embed reads off the NDJSON stream + GET /config.
 *
 * They are defined as Zod schemas and validated at the boundary (see .cursor/rules/300-typescript.mdc:
 * "Antwoorden van externe API's"). The embed runs on third-party pages, so a malformed or hostile
 * /config or stream line is dropped instead of flowing into the UI (e.g. `theme.primary` lands in a
 * CSS `color-mix(...)` string). Unknown keys are stripped, so the runtime may add fields without
 * breaking an older embed bundle.
 */

export const embedCitationSchema = z.object({
  ref: z.number(),
  title: z.string(),
  sourceUri: z.string(),
  fund: z.string(),
  version: z.string(),
  quote: z.string(),
  snippet: z.string(),
  sourceRef: z.string().nullable(),
  heading: z.string().nullable(),
  article: z.string().nullable(),
});
export type EmbedCitation = z.infer<typeof embedCitationSchema>;

/** Early retrieval stub — mirrors shared `retrievedPassageSchema` (not a verified citation). */
export const retrievedPassageSchema = z.object({
  ref: z.number().int().positive(),
  title: z.string(),
  sourceRef: z.string().nullable(),
  article: z.string().nullable(),
});
export type RetrievedPassage = z.infer<typeof retrievedPassageSchema>;

/** Discriminators must match `@wunderstack/shared` `chatEventSchema`: status|text|citations|followups|done|error. */
export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    phase: z.string(),
    count: z.number().optional(),
    passages: z.array(retrievedPassageSchema).max(50).optional(),
  }),
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({
    type: z.literal("citations"),
    found: z.boolean(),
    needsClarification: z.boolean(),
    citations: z.array(embedCitationSchema),
    answer: z.string(),
    citationVerificationFailed: z.boolean(),
    runOutcome: z.string().optional(),
  }),
  z.object({
    type: z.literal("followups"),
    questions: z.array(z.string().min(1).max(200)).max(3),
  }),
  z.object({ type: z.literal("done"), traceId: z.string().nullable() }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    traceId: z.string().nullable().optional(),
    runOutcome: z.string().optional(),
  }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;

export const embedThemeSchema = z.object({
  primary: z.string().optional(),
  accent: z.string().optional(),
  radius: z.string().optional(),
  logo: z.string().optional(),
});
export type EmbedTheme = z.infer<typeof embedThemeSchema>;

export const starterCategorySchema = z.object({
  label: z.string().min(1).max(80),
  questions: z.array(z.string().min(1).max(200)).min(1).max(6),
});
export type StarterCategory = z.infer<typeof starterCategorySchema>;

export const embedTextsSchema = z.object({
  tagline: z.string().optional(),
  intro: z.string().optional(),
  article50: z.string().optional(),
  /** Flat starter list (legacy). Used only when `starterCategories` is absent. */
  starters: z.array(z.string().min(1).max(200)).max(6).optional(),
  /** Category pills + questions. Omit to use the embed defaults. */
  starterCategories: z.array(starterCategorySchema).min(1).max(8).optional(),
});
export type EmbedTexts = z.infer<typeof embedTextsSchema>;

export const embedConfigSchema = z.object({
  agentId: z.string(),
  theme: embedThemeSchema,
  texts: embedTextsSchema,
  article50: z.string(),
  /** Concrete fund this instance serves; sent on chat so the request is never unscoped. */
  fund: z.string().min(1).optional(),
});
export type EmbedConfig = z.infer<typeof embedConfigSchema>;

export type EmbedLayout = "launcher" | "inline";
