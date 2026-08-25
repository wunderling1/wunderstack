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

export const agentHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export const agentQuestionSchema = z.object({
  /** The end-user's question, answered in Dutch. */
  question: z.string().min(1, "question must not be empty"),
  /** Restrict to a single O&O fund's corpus (required for corpus isolation). */
  fund: z.string().min(1),
  /** Recent turns, used only to condense elliptical follow-up questions into a standalone query. */
  history: z.array(agentHistoryMessageSchema).max(6).default([]),
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
   * each side is stable. This is the CAO-agent default; arbo uses a lower default via
   * `arboQuestionSchema`. A per-fund minScore lives in `agent_config` when configured.
   * See golden-set.REVIEW.md (Gate F stap 1).
   */
  minScore: z.number().min(0).max(1).default(0.48),
});

export type AgentQuestion = z.input<typeof agentQuestionSchema>;

/**
 * Arbo-agent question shape — same seam as the shared question schema with a separate minScore
 * default calibrated on the arbocatalogus corpus (fallback; per-fund value lives in agent_config).
 */
export const arboQuestionSchema = agentQuestionSchema.extend({
  minScore: z.number().min(0).max(1).default(0.35),
});

export type ArboQuestion = z.input<typeof arboQuestionSchema>;

/** A verified, structure-aware citation (article/lid + quote + snippet). */
export const agentCitationSchema = citationSchema;

export type AgentCitation = z.infer<typeof agentCitationSchema>;

export const agentUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export type AgentUsage = z.infer<typeof agentUsageSchema>;

export const agentAnswerSchema = z.object({
  /** The Dutch answer, with `[n]` citation markers when sources were used. When
   * `needsClarification` is true this holds the clarifying question instead. */
  answer: z.string(),
  /** False when nothing cleared the relevance threshold (the "niet gevonden" case). */
  found: z.boolean(),
  /** True when the agent asked a clarifying question instead of answering (underspecified input). */
  needsClarification: z.boolean().default(false),
  /** Verified citations — only chunks the model cited with a verbatim quote. */
  citations: z.array(agentCitationSchema).default([]),
  /** Langfuse trace id for this answer, so user feedback can be scored onto it. Null when tracing
   * is not configured. */
  traceId: z.string().nullable().default(null),
  /** LLM token usage for the generation step (all zero when no LLM call was made). */
  usage: agentUsageSchema,
  /** True when one or more model citations failed verbatim verification. */
  citationVerificationFailed: z.boolean().default(false),
  /** Grounded follow-up question chips (empty when not found / clarify / suggestion failed). */
  followUpQuestions: z.array(z.string().min(1).max(200)).max(3).default([]),
});

export type AgentAnswer = z.infer<typeof agentAnswerSchema>;

/**
 * Progress phases the agent passes through while answering. Emitted as `status` events so the UI can
 * show named progress ("CAO doorzoeken…" → "N passages gevonden" → "Antwoord formuleren…") instead
 * of an undifferentiated spinner. The phase names are language-neutral; the app maps them to
 * user-facing (Dutch) labels. Only the normal answer path emits these; the clarify and not-found
 * paths return too fast for a phase flash to help.
 */
export type AgentStreamPhase = "searching" | "retrieved" | "generating";

/**
 * Streaming counterpart of `AgentAnswer`, as a sequence of events the API layer can forward to the
 * browser (see apps/playground). Order on the normal path: zero or more `status` events, zero or more
 * `text` deltas, exactly one `citations` (verified), optionally one `followups`, then exactly one
 * `done`. Clarify and not-found paths emit `text` → `citations` → `done` (no followups).
 */
export type AgentStreamEvent =
  | { type: "status"; phase: AgentStreamPhase; count?: number }
  | { type: "text"; delta: string }
  | {
      type: "citations";
      found: boolean;
      needsClarification: boolean;
      citations: AgentCitation[];
      citationVerificationFailed: boolean;
      /** Final answer text (sentinel/citation block stripped, failed markers removed). The client
       * replaces its accumulated streamed text with this to reconcile stripped citations. */
      answer: string;
    }
  | {
      type: "followups";
      /** 2–3 grounded Dutch follow-up questions; omitted from the stream when empty. */
      questions: string[];
    }
  | { type: "done"; usage: AgentUsage; traceId: string | null };

/** Per-call options for the agent seam. */
export interface AgentAnswerOptions {
  /**
   * Aborts in-flight work (retrieval embedding + LLM generation). The API layer wires this to the
   * client connection so a disconnect stops the model call instead of burning tokens.
   */
  signal?: AbortSignal;
  /**
   * Stable per-conversation id. Threaded onto the Langfuse trace so tracing and the interaction
   * event-log share one identity model (Fase 1). Undefined = untagged.
   */
  sessionId?: string;
  /** Pseudonymous end-user id for the trace; undefined for embed users (no identification in v1). */
  userId?: string;
  /**
   * Surface that produced this turn (playground | embed | mcp | api). Threaded onto the Langfuse
   * trace so portal and MCP traffic can be separated (PLAN-mcp-server Fase 1a).
   */
  channel?: string;
  /**
   * Corpus snapshot tag from `control.agent_config` (resolved instance). Langfuse tag; not a
   * retrieval filter.
   */
  corpusVersion?: string;
}

/**
 * A grounded RAG agent as the rest of the system sees it: a question in, a cited answer out.
 * Mastra stays hidden behind this interface (see .cursor/rules/500-agents.mdc).
 */
export interface GroundedAgent {
  answer(input: AgentQuestion, options?: AgentAnswerOptions): Promise<AgentAnswer>;
  answerStream(input: AgentQuestion, options?: AgentAnswerOptions): AsyncIterable<AgentStreamEvent>;
}
