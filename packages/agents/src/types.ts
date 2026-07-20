import { citationSchema } from "@wunderstack/shared";
import { z } from "zod";

/**
 * The agent seam. Apps, API routes and RAG code import *this* interface — never Mastra, never a
 * model provider (see .cursor/rules/500-agents.mdc). Mastra lives entirely inside this package, so
 * swapping the framework only touches `@wunderstack/agents`.
 *
 * Every contract here is a Zod schema; TypeScript types are inferred from it (one source of truth,
 * runtime-validated at the boundary — see .cursor/rules/300-typescript.mdc).
 */

export const caoHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export const caoQuestionSchema = z.object({
  /** The end-user's question, answered in Dutch. */
  question: z.string().min(1, "question must not be empty"),
  /** Restrict to a single O&O fund's CAO (required for corpus isolation). */
  fund: z.string().min(1),
  /** Recent turns, used only to condense elliptical follow-up questions into a standalone query. */
  history: z.array(caoHistoryMessageSchema).max(6).default([]),
  /** How many chunks to keep after reranking (fed to the agent). Defaults to RERANK_CONFIG.topK (5). */
  topK: z.number().int().positive().max(50).default(5),
  /**
   * Minimum cosine similarity in [0,1] a chunk must reach to count as relevant. If no chunk clears
   * this bar the agent answers "niet gevonden" instead of inventing — the anti-hallucination guard.
   *
   * 0.48 (raised from 0.35, PLAN-v3 Fase 14.0 stap 1). At 0.35 semantically-adjacent but out-of-corpus
   * questions (kinderopvang / bedrijfsfitness / jubileumgratificatie — absent from the ETD CAO) still
   * cleared the floor at ~0.44-0.47 and were answered instead of refused (Gate F refusal-guard). The
   * ETD corpus has a clean gap — out-of-corpus probes top out at 0.465 while every in-scope relevant
   * chunk scores >= 0.520 (measured across both the base and fund layers) — so 0.48 refuses the probes
   * (3/3) without dropping a single in-scope hit. Embeddings are deterministic, so the ~0.02 margin on
   * each side is stable. This is a global default (v1 is single-tenant, ETD is the only real fund);
   * a per-fund minScore is deliberately deferred until a second fund's corpus forces it (regel van
   * drie). See golden-set.REVIEW.md (Gate F stap 1).
   */
  minScore: z.number().min(0).max(1).default(0.48),
});

export type CaoQuestion = z.input<typeof caoQuestionSchema>;

/** A verified, structure-aware citation (article/lid + quote + snippet). */
export const caoCitationSchema = citationSchema;

export type CaoCitation = z.infer<typeof caoCitationSchema>;

export const caoUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export type CaoUsage = z.infer<typeof caoUsageSchema>;

export const caoAnswerSchema = z.object({
  /** The Dutch answer, with `[n]` citation markers when sources were used. When
   * `needsClarification` is true this holds the clarifying question instead. */
  answer: z.string(),
  /** False when nothing cleared the relevance threshold (the "niet gevonden" case). */
  found: z.boolean(),
  /** True when the agent asked a clarifying question instead of answering (underspecified input). */
  needsClarification: z.boolean().default(false),
  /** Verified citations — only chunks the model cited with a verbatim quote. */
  citations: z.array(caoCitationSchema).default([]),
  /** Langfuse trace id for this answer, so user feedback can be scored onto it. Null when tracing
   * is not configured. */
  traceId: z.string().nullable().default(null),
  /** LLM token usage for the generation step (all zero when no LLM call was made). */
  usage: caoUsageSchema,
  /** True when one or more model citations failed verbatim verification. */
  citationVerificationFailed: z.boolean().default(false),
});

export type CaoAnswer = z.infer<typeof caoAnswerSchema>;

/**
 * Progress phases the agent passes through while answering. Emitted as `status` events so the UI can
 * show named progress ("CAO doorzoeken…" → "N passages gevonden" → "Antwoord formuleren…") instead
 * of an undifferentiated spinner. The phase names are language-neutral; the app maps them to
 * user-facing (Dutch) labels. Only the normal answer path emits these; the clarify and not-found
 * paths return too fast for a phase flash to help.
 */
export type CaoStreamPhase = "searching" | "retrieved" | "generating";

/**
 * Streaming counterpart of `CaoAnswer`, as a sequence of events the API layer can forward to the
 * browser (see apps/demo). Order on the normal path: zero or more `status` events, zero or more
 * `text` deltas, exactly one `citations` (verified), then exactly one `done`. Clarify and not-found
 * paths emit `text` → `done` directly (no citations).
 */
export type CaoStreamEvent =
  | { type: "status"; phase: CaoStreamPhase; count?: number }
  | { type: "text"; delta: string }
  | {
      type: "citations";
      found: boolean;
      needsClarification: boolean;
      citations: CaoCitation[];
      citationVerificationFailed: boolean;
      /** Final answer text (sentinel/citation block stripped, failed markers removed). The client
       * replaces its accumulated streamed text with this to reconcile stripped citations. */
      answer: string;
    }
  | { type: "done"; usage: CaoUsage; traceId: string | null };

/** Per-call options for the agent seam. */
export interface CaoAnswerOptions {
  /**
   * Aborts in-flight work (retrieval embedding + LLM generation). The API layer wires this to the
   * client connection so a disconnect stops the model call instead of burning tokens.
   */
  signal?: AbortSignal;
}

/**
 * The CAO-agent as the rest of the system sees it: a question in, a grounded, cited answer out.
 * `answer` resolves the whole answer at once; `answerStream` yields it incrementally with verified
 * citations at the end. Mastra stays hidden behind this interface (see .cursor/rules/500-agents.mdc).
 */
export interface CaoAgent {
  answer(input: CaoQuestion, options?: CaoAnswerOptions): Promise<CaoAnswer>;
  answerStream(input: CaoQuestion, options?: CaoAnswerOptions): AsyncIterable<CaoStreamEvent>;
}
