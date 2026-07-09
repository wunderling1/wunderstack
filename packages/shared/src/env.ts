import { z } from "zod";

/**
 * Single source of truth for environment configuration.
 * process.env is parsed exactly once, here, and exported as typed config.
 * Add new keys to this schema (and to .env.example) as later phases need them.
 */

/** Treat an empty env var (e.g. `KEY=` in a .env file) as unset. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const envSchema = z.object({
  NODE_ENV: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["development", "test", "production"]).default("development"),
  ),
  // Scalingo managed Postgres connection string. Optional at parse time so the
  // public demo can boot without a database; @wunderstack/db asserts its presence
  // at the point of connection.
  DATABASE_URL: optional(z.url()),
  // Provider credentials for the sovereign default path (@wunderstack/ai).
  // Optional at parse time; each is asserted where it is actually used.
  MISTRAL_API_KEY: optional(z.string().min(1)),
  // Scaleway Generative APIs (EU) secret key — embeddings + reranking. Used by @wunderstack/ai.
  SCALEWAY_API_KEY: optional(z.string().min(1)),
  // Rerank pipeline overrides (see packages/shared/src/config/rerank.ts). All optional.
  RERANK_ENABLED: optional(z.enum(["true", "false"])),
  RERANK_MODEL: optional(z.string().min(1)),
  RERANK_CANDIDATE_K: optional(z.coerce.number().int().positive().max(50)),
  RERANK_TOP_K: optional(z.coerce.number().int().positive().max(50)),
  /** Vector-score ceiling above which rerank is skipped (`null` to disable). */
  RERANK_SKIP_ABOVE_SCORE: optional(z.union([z.coerce.number().min(0).max(1), z.literal("null")])),
  // Langfuse EU Cloud tracing (@wunderstack/agents). Optional at parse time so the
  // demo can boot without them; when both keys are set the CAO-agent exports traces.
  LANGFUSE_PUBLIC_KEY: optional(z.string().min(1)),
  LANGFUSE_SECRET_KEY: optional(z.string().min(1)),
  // Defaults to Langfuse EU Cloud when unset (asserted in @wunderstack/agents).
  LANGFUSE_BASE_URL: optional(z.url()),
  // Shared secret used to HMAC-verify inbound webhooks (see apps/demo/lib/webhook-auth.ts).
  // When unset the webhook rejects every request as unconfigured — a signed seam by default.
  WEBHOOK_SIGNING_SECRET: optional(z.string().min(1)),
  // Comma-separated allowlist of O&O fund keys the served chat API may answer for. When set, the
  // API authorizes the requested fund against this list and refuses the unscoped "all funds" query
  // (data-plane + corpus isolation, see security-audit finding #2). Required in production. Unset =
  // local/dev only: the API falls back to a single concrete default fund (never an unscoped query).
  CAO_FUNDS: optional(z.string().min(1)),
  // Eval gate controls (packages/agents/src/evals/cao.eval.ts). When truthy, a gate that cannot
  // run because its API keys are missing FAILS instead of skipping — "skipped != passed". Set on
  // the merge-to-main job so Gate B/C are genuinely required; unset locally so dev runs may skip.
  EVAL_REQUIRE_ALL: optional(z.enum(["1", "true", "0", "false"])),
  // Number of LLM-judge samples per case for Gate C; the median is taken (majority vote against
  // judge non-determinism). Defaults to 1; raise to 3 on the merge queue / nightly run.
  EVAL_JUDGE_SAMPLES: optional(z.coerce.number().int().positive().max(9)),
  // When truthy, a known-good eval run records the current metrics as the regression baseline
  // (packages/agents/src/evals/fixtures/baseline.json) instead of comparing against it.
  EVAL_WRITE_BASELINE: optional(z.enum(["1", "true", "0", "false"])),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
