import { z } from "zod";

/**
 * App-only environment for the marketing site, parsed once via Zod (see .cursor/rules/300-typescript.mdc:
 * "parse process.env één keer via een Zod-schema, exporteer typed config"). These vars drive the live
 * CAO demo embed (the Fase 4 snippet pointed at tenant zero). Both are optional; when either is unset
 * the detail page shows a "not configured" note instead of a broken embed.
 */

/** Treat an empty env var (`KEY=` in a .env) as unset. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const schema = z.object({
  /** Origin the embed <script src> points at (the runtime that serves /embed.js). */
  EMBED_SCRIPT_BASE: optional(z.url()),
  /** Public tenant-key for the demo tenant (safe to expose; gated by CORS + rate limiting). */
  EMBED_PUBLIC_KEY: optional(z.string().min(1)),
});

export const env = schema.parse({
  EMBED_SCRIPT_BASE: process.env.EMBED_SCRIPT_BASE,
  EMBED_PUBLIC_KEY: process.env.EMBED_PUBLIC_KEY,
});
