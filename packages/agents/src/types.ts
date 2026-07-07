import { citationSchema, citationSourceSchema } from "@wunderstack/shared";
import { z } from "zod";

/**
 * The agent seam. Apps, API routes and RAG code import *this* interface — never Mastra, never a
 * model provider (see .cursor/rules/500-agents.mdc). Mastra lives entirely inside this package, so
 * swapping the framework only touches `@wunderstack/agents`.
 *
 * Every contract here is a Zod schema; TypeScript types are inferred from it (one source of truth,
 * runtime-validated at the boundary — see .cursor/rules/300-typescript.mdc).
 */

export const caoQuestionSchema = z.object({
  /** The end-user's question, answered in Dutch. */
  question: z.string().min(1, "question must not be empty"),
  /** Restrict to a single O&O fund's CAO. Omit to search all funds (control/data-plane key). */
  fund: z.string().min(1).optional(),
  /** How many chunks to retrieve as candidate context. */
  topK: z.number().int().positive().max(50).default(5),
  /**
   * Minimum cosine similarity in [0,1] a chunk must reach to count as relevant. If no chunk clears
   * this bar the agent answers "niet gevonden" instead of inventing — the anti-hallucination guard.
   */
  minScore: z.number().min(0).max(1).default(0.35),
});

export type CaoQuestion = z.input<typeof caoQuestionSchema>;

/** The answer's cited sources use the shared citation shape (see @wunderstack/shared). */
export const caoSourceSchema = citationSourceSchema;

export type CaoSource = z.infer<typeof caoSourceSchema>;

/** A richer, structure-aware citation (article/lid + snippet); see @wunderstack/shared. */
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
  /** The documents the answer is grounded in, deduplicated and citation-numbered. */
  sources: z.array(caoSourceSchema),
  /** Structure-aware citations (article/lid + snippet) the UI can expand (Fase 12). */
  citations: z.array(caoCitationSchema).default([]),
  /** LLM token usage for the generation step (all zero when no LLM call was made). */
  usage: caoUsageSchema,
});

export type CaoAnswer = z.infer<typeof caoAnswerSchema>;

/**
 * Streaming counterpart of `CaoAnswer`, as a sequence of events the API layer can forward to the
 * browser (see apps/demo). The contract is deliberately transport-agnostic — the app decides how to
 * serialize it (NDJSON/SSE). Order guarantee: exactly one `sources` first, then zero or more `text`
 * deltas, then exactly one `done`.
 *
 * Real token-by-token streaming lights up once @wunderstack/ai streams (its `generateText` is a
 * single call today, so the model seam currently emits the answer as one `text` delta); the event
 * shape does not change when that happens.
 */
export type CaoStreamEvent =
  | {
      type: "sources";
      found: boolean;
      needsClarification: boolean;
      sources: CaoSource[];
      citations: CaoCitation[];
    }
  | { type: "text"; delta: string }
  | { type: "done"; usage: CaoUsage };

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
 * `answer` resolves the whole answer at once; `answerStream` yields it incrementally with sources
 * up front. Mastra stays hidden behind this interface (see .cursor/rules/500-agents.mdc).
 */
export interface CaoAgent {
  answer(input: CaoQuestion, options?: CaoAnswerOptions): Promise<CaoAnswer>;
  answerStream(input: CaoQuestion, options?: CaoAnswerOptions): AsyncIterable<CaoStreamEvent>;
}
