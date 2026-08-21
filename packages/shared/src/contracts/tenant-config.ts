import { z } from "zod";

/**
 * Tenant-config contracts (Fase 4). A tenant-config row lives on the fondsinstance and drives the
 * embed: the public theme + texts served by `GET /config`, the CORS allowlist, and the public
 * tenant-key. These schemas are pure (no DB, no node deps) so both the runtime and the dashboard
 * console validate against the same shapes.
 */

/** A curated subset of the design tokens a fund may theme (D17 runtime theming migration). */
export const tenantThemeSchema = z
  .object({
    primary: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Gebruik een hex-kleur zoals #4f46e5.")
      .optional(),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Gebruik een hex-kleur zoals #4f46e5.")
      .optional(),
    /** CSS length for the control radius, e.g. "0.5rem". */
    radius: z.string().max(16).optional(),
    logo: z.url().max(500).optional(),
  })
  .strict();
export type TenantTheme = z.infer<typeof tenantThemeSchema>;

/** One starter-question category shown on the empty embed chat. */
export const starterCategorySchema = z
  .object({
    label: z.string().min(1).max(80),
    questions: z.array(z.string().min(1).max(200)).min(1).max(6),
  })
  .strict();
export type StarterCategory = z.infer<typeof starterCategorySchema>;

/** User-facing (NL) text overrides for the embed. */
export const tenantTextsSchema = z
  .object({
    tagline: z.string().max(200).optional(),
    /** Empty-state supporting sentence under the tagline. */
    intro: z.string().max(400).optional(),
    /** Overrides the default Article 50 transparency notice. */
    article50: z.string().max(500).optional(),
    /** Flat starter list (legacy). Used only when `starterCategories` is absent. */
    starters: z.array(z.string().min(1).max(200)).max(6).optional(),
    /** Category pills + questions on the empty chat. Omit to use the embed defaults. */
    starterCategories: z.array(starterCategorySchema).min(1).max(8).optional(),
  })
  .strict();
export type TenantTexts = z.infer<typeof tenantTextsSchema>;

/**
 * Default Article 50 (EU AI Act) transparency notice. Always shown in the embed unless a tenant
 * overrides it — the notice is on by default, never opt-in.
 */
export const DEFAULT_ARTICLE_50_NOTICE =
  "Je praat met een AI-assistent. Antwoorden kunnen onjuist zijn; controleer belangrijke informatie bij de bron.";

/** Public config the embed fetches via `GET /config` (safe to expose cross-origin). */
export const tenantPublicConfigSchema = z.object({
  agentId: z.string().min(1),
  theme: tenantThemeSchema,
  texts: tenantTextsSchema,
  /** Resolved Article 50 notice (tenant override or the default). */
  article50: z.string().min(1),
  /** Concrete fund this instance serves. The embed sends it on chat (no fund selector). */
  fund: z.string().min(1),
  /** Dutch labels for retrieval progress phases (from agent_config or agent defaults). */
  statusLabels: z
    .object({
      searching: z.string().min(1).max(80),
      retrieved: z.string().min(1).max(80),
      generating: z.string().min(1).max(80),
    })
    .strict(),
});
export type TenantPublicConfig = z.infer<typeof tenantPublicConfigSchema>;

/**
 * Tenant-key format. A public identifier, NOT a secret: it may sit in the embed snippet in plain
 * sight. Access is gated by the CORS allowlist + rate limiting, not by key secrecy. Rotating the key
 * is how a fund invalidates old snippets.
 */
const TENANT_KEY_RE = /^pk_[A-Za-z0-9_-]{20,}$/;
export function isTenantKeyFormat(key: string): boolean {
  return TENANT_KEY_RE.test(key);
}
