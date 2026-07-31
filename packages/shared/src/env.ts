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
  // Optional dedicated writer connection for the tenant_config tables (Fase 4, second DB role). Falls
  // back to DATABASE_URL when unset. In deployment this is a DB user granted write on tenant_config
  // only, so the console can theme/rotate keys without holding broad write access.
  TENANT_CONFIG_WRITER_DATABASE_URL: optional(z.url()),
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
  // Like EVAL_REQUIRE_ALL but for the DB-backed integration gates (Gate B-integration and Gate D
  // integration, which need DATABASE_URL). Set only on the nightly job, which wires a staging DB; on
  // PRs the DB is intentionally absent, so those gates skip rather than fail. See cao.eval.ts (E11).
  EVAL_REQUIRE_DB: optional(z.enum(["1", "true", "0", "false"])),
  // Number of LLM-judge samples per case for Gate C; the median is taken (majority vote against
  // judge non-determinism). Defaults to 1; raise to 3 on the merge queue / nightly run.
  EVAL_JUDGE_SAMPLES: optional(z.coerce.number().int().positive().max(9)),
  // Override the Gate C answer-generation model. Default = DEFAULT_LLM_MODEL (the production generator),
  // so the gate scores what users actually get; this only exists to A/B another sovereign generator
  // behind the AI seam without a code change. The model must still be EU-sovereign (enforced by
  // @wunderstack/ai's resolveModel). Recorded in the artefact. See docs/eval/GATE-ARCHITECTURE.md.
  EVAL_GENERATION_MODEL: optional(z.string().min(1)),
  // Generation analogue of EVAL_JUDGE_SAMPLES: total answer-generation attempts per Gate C case in the
  // best-of-N contract loop (generate-answer.ts). The first clean attempt wins; otherwise the
  // lowest-penalty one. Tames single-sample generation variance on the zero-tolerance count gates
  // (citation-verification, dangling-marker) without weakening a threshold. Defaults to 2 (one
  // generation + one repair, = production); raise to 3 on the merge queue / nightly run.
  EVAL_GENERATION_SAMPLES: optional(z.coerce.number().int().positive().max(9)),
  // When truthy, a known-good eval run records the current metrics as the regression baseline
  // (packages/agents/src/evals/fixtures/baseline.json) instead of comparing against it.
  EVAL_WRITE_BASELINE: optional(z.enum(["1", "true", "0", "false"])),
  // Commit SHA of the checked-out revision (GitHub Actions sets this). Recorded in the per-run eval
  // artefact (E9) so a report is traceable to an exact commit; null on local runs without it.
  GITHUB_SHA: optional(z.string().min(1)),
  // "true" inside GitHub Actions. Only used to emit workflow annotations (::error::) that a local run
  // should not print; never to change what a gate measures.
  GITHUB_ACTIONS: optional(z.string().min(1)),
  // Ingestion chunker overrides (scripts/ingest). Optional; the chunker falls back to its defaults
  // when unset. Coerced + validated so a non-numeric value fails loud here instead of flowing into
  // the chunker as NaN.
  INGEST_CHUNK_CHARS: optional(z.coerce.number().int().positive()),
  INGEST_OVERLAP_CHARS: optional(z.coerce.number().int().positive()),
  // Tenant-zero hardening (Fase 5): a global daily ceiling on chat requests across the whole runtime
  // process — a denial-of-wallet backstop on top of the per-IP and per-key limits. Counts every chat
  // attempt that reaches the expensive path; resets at UTC midnight. Unset or 0 = disabled (dev). Like
  // the other rate-limit counters this is per process (see apps/runtime/lib/rate-limit.ts).
  RUNTIME_DAILY_CAP: optional(z.coerce.number().int().nonnegative()),
  // Chat-stream robustness (apps/runtime /api/chat). Unset = the route's built-in defaults
  // (45s turn budget, 10s heartbeat). Lower under a reverse-proxy idle timeout; raise for slow
  // models. REQUEST_TIMEOUT_MS in @wunderstack/ai must stay >= the turn budget so the turn budget
  // fires first and the route can emit a clean timeout error.
  RUNTIME_CHAT_TURN_BUDGET_MS: optional(z.coerce.number().int().positive().max(300_000)),
  RUNTIME_CHAT_HEARTBEAT_MS: optional(z.coerce.number().int().positive().max(60_000)),
});

export type Env = z.infer<typeof envSchema>;

export { envSchema };

export const env: Env = envSchema.parse(process.env);
