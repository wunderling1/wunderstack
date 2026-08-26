import { z } from "zod";

/**
 * App-only environment for the dashboard, parsed once via Zod (see .cursor/rules/300-typescript.mdc:
 * "parse process.env één keer via een Zod-schema, exporteer typed config"). Fails loud at boot on a
 * malformed value instead of silently defaulting to "".
 *
 * `AUTH_SECRET` is consumed by next-auth itself (not read here); it is declared so a missing/empty
 * value surfaces as a typed boot error rather than a confusing runtime failure. `DATABASE_URL` is
 * parsed by @wunderstack/shared's env, so it is not duplicated here.
 */

/** Treat an empty env var (`KEY=` in a .env) as unset. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const schema = z.object({
  /** Langfuse EU base URL; feeds the admin "Open in Langfuse" link (null → shown disabled). */
  LANGFUSE_BASE_URL: optional(z.url()),
  /** Origin the generated embed <script src> points at (the fonds' runtime). */
  EMBED_SCRIPT_BASE: optional(z.url()),
  /** next-auth signing secret; validated for a loud boot error (next-auth reads it directly). */
  AUTH_SECRET: optional(z.string().min(1)),
  /** Public origin of the learner UI; used to show copyable LTI 1.1 launch URLs. */
  ROLEPLAY_PUBLIC_URL: optional(z.url()),
});

export const env = schema.parse({
  LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
  EMBED_SCRIPT_BASE: process.env.EMBED_SCRIPT_BASE,
  AUTH_SECRET: process.env.AUTH_SECRET,
  ROLEPLAY_PUBLIC_URL: process.env.ROLEPLAY_PUBLIC_URL,
});
