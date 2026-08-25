import type { Mastra } from "@mastra/core";
import { SpanType } from "@mastra/core/observability";
import type { Span } from "@mastra/core/observability";

/**
 * Request-scoped tracing for a grounded agent, confined to this package (Mastra/Langfuse never leak
 * past the agent seam — see .cursor/rules/500-agents.mdc).
 *
 * Why this exists: the agent's `generate`/`stream` already produce a Langfuse trace, but two calls
 * were untraced (see the code review, W1/W2):
 *   - the "niet gevonden" path returns WITHOUT calling the model, so no trace was emitted at all;
 *   - the query-embedding is a model call that never appeared in a trace.
 *
 * This helper opens one root span per question and records the retrieval step (pgvector search) plus
 * the query-embedding as child spans — on EVERY path, including the refusal. The subsequent LLM
 * generation is linked into the same trace via `link()` (traceId + parentSpanId). Every operation is
 * best-effort and fully guarded: a tracing failure (or no configured exporter) must never break an
 * answer, so it degrades to a no-op.
 */

export interface AgentTraceInput {
  /** Catalog agent id (e.g. cao | arbo) — surfaced as Langfuse span name and tag. Required. */
  agentKey: string;
  question: string;
  retrievalQuery?: string;
  fund: string | undefined;
  topK: number;
  minScore: number;
  /** Stable per-conversation id; shared with the interaction event-log (one identity model). */
  sessionId?: string;
  /** Pseudonymous end-user id; undefined for embed users (no identification in v1). */
  userId?: string;
  /** Deployment environment (development | test | production) — surfaced as a Langfuse tag. */
  environment?: string;
  /**
   * Surface that produced this turn (playground | embed | mcp | api). Surfaced as a Langfuse tag so
   * portal and MCP traffic can be separated (PLAN-mcp-server Fase 1a).
   */
  channel?: string;
  /** Corpus snapshot tag from the resolved instance (`control.agent_config`). */
  corpusVersion?: string;
}

export interface RetrievalHit {
  chunkId: string;
  ordinal: number;
  score: number;
  title: string;
}

export interface RetrievalEvidence {
  embeddingModel: string;
  embeddingDim: number;
  hits: RetrievalHit[];
  found: boolean;
  /** Per-phase wall-clock timings in milliseconds (Langfuse latency budget). */
  timings?: {
    rewriteMs: number;
    embedMs: number;
    searchMs: number;
    rerankMs: number;
    totalMs: number;
  };
}

/** Fields merged into `tracingOptions` so a later generate()/stream() joins this trace. */
export interface TraceLink {
  traceId?: string;
  parentSpanId?: string;
}

/** Handle for the retrieval sub-span; `end` records the embedding + search evidence. */
export interface RetrievalTraceSpan {
  end(evidence: RetrievalEvidence): void;
}

/** Handle for a lightweight MODEL_GENERATION child span (e.g. follow-up suggestions). */
export interface ModelCallTraceSpan {
  end(output: {
    model: string;
    questionCount: number;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }): void;
}

/** Outcome recorded on the root span so clarify-turns, refusals and citation counts are traceable. */
export interface AgentTraceOutcome {
  found: boolean;
  /** True when the agent asked a clarifying question instead of answering. */
  needsClarification?: boolean;
  /** True when the answer was the "niet gevonden" refusal (nothing cleared the threshold). */
  refused?: boolean;
  /** Number of citations attached to the answer. */
  citationCount?: number;
  /** Time-to-first-token in ms (first streamed text delta after request start). */
  ttftMs?: number;
  /** Number of grounded follow-up chips emitted (0 when skipped / failed). */
  followUpCount?: number;
}

export interface AgentTrace {
  startRetrieval(meta: {
    topK: number;
    minScore: number;
    fund: string | undefined;
    retrievalQuery?: string;
    condensed: boolean;
  }): RetrievalTraceSpan;
  /** Best-effort child span for a non-Mastra model call (follow-up suggestions). */
  startModelCall(name: string, input?: Record<string, unknown>): ModelCallTraceSpan;
  link(): TraceLink;
  end(output: AgentTraceOutcome): void;
  fail(error: unknown): void;
  /** Record time-to-first-token once the first text delta is emitted. */
  recordTtft(ms: number): void;
}

const NOOP_RETRIEVAL: RetrievalTraceSpan = { end() {} };
const NOOP_MODEL_CALL: ModelCallTraceSpan = { end() {} };
const NOOP_TRACE: AgentTrace = {
  startRetrieval: () => NOOP_RETRIEVAL,
  startModelCall: () => NOOP_MODEL_CALL,
  link: () => ({}),
  end() {},
  fail() {},
  recordTtft() {},
};

/**
 * Start a trace for one agent question. Returns a no-op handle when no observability instance is
 * configured or if span creation fails, so callers never need to null-check.
 */
export function startAgentTrace(mastra: Mastra, input: AgentTraceInput): AgentTrace {
  const agentKey = input.agentKey;
  const agentTag = `${agentKey}-agent`;
  let root: Span<SpanType.AGENT_RUN> | undefined;
  try {
    const instance = mastra.observability.getDefaultInstance();
    root = instance?.startSpan({
      type: SpanType.AGENT_RUN,
      name: agentTag,
      input: {
        question: input.question,
        retrievalQuery: input.retrievalQuery ?? input.question,
        fund: input.fund ?? null,
        topK: input.topK,
        minScore: input.minScore,
      },
      // session_id + user_id give Langfuse the same identity model as the interaction event-log;
      // fund + environment + channel are the analytics dimensions we filter traces by.
      metadata: {
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        ...(input.userId === undefined ? {} : { userId: input.userId }),
        ...(input.environment === undefined ? {} : { environment: input.environment }),
        ...(input.channel === undefined ? {} : { channel: input.channel }),
        ...(input.corpusVersion === undefined ? {} : { corpusVersion: input.corpusVersion }),
        fund: input.fund ?? null,
        agentKey,
      },
      tags: [
        agentTag,
        ...(input.fund ? [input.fund] : []),
        agentKey,
        ...(input.corpusVersion ? [input.corpusVersion] : []),
        ...(input.environment ? [input.environment] : []),
        ...(input.channel ? [input.channel] : []),
      ],
    });
  } catch {
    root = undefined;
  }

  if (!root || !root.isValid) {
    return NOOP_TRACE;
  }

  const rootSpan = root;
  let settled = false;
  let ttftMs: number | undefined;

  return {
    startRetrieval(meta) {
      let span: Span<SpanType.RAG_VECTOR_OPERATION> | undefined;
      try {
        span = rootSpan.createChildSpan({
          type: SpanType.RAG_VECTOR_OPERATION,
          name: "cao-retrieval",
          input: {
            question: input.question,
            query: meta.retrievalQuery ?? input.retrievalQuery ?? input.question,
            condensed: meta.condensed,
            topK: meta.topK,
            minScore: meta.minScore,
            fund: meta.fund ?? null,
          },
          attributes: { operation: "query", store: "pgvector", indexName: "chunks", topK: meta.topK },
        });
      } catch {
        span = undefined;
      }

      if (!span || !span.isValid) {
        return NOOP_RETRIEVAL;
      }

      const retrievalSpan = span;
      return {
        end(evidence) {
          try {
            // Record the query embedding as a point-in-time event (the model call W2 flagged).
            try {
              retrievalSpan.createEventSpan({
                type: SpanType.RAG_EMBEDDING,
                name: "query-embedding",
                attributes: {
                  model: evidence.embeddingModel,
                  provider: "scaleway",
                  dimensions: evidence.embeddingDim,
                  inputCount: 1,
                  mode: "query",
                },
              });
            } catch {
              /* the embedding event is best-effort */
            }

            const scores = evidence.hits.map((hit) => hit.score);
            const phaseTimings = evidence.timings;
            retrievalSpan.end({
              attributes: { operation: "query", dimensions: evidence.embeddingDim, topK: meta.topK },
              metadata: {
                found: evidence.found,
                hitCount: evidence.hits.length,
                topScore: scores[0] ?? null,
                scores,
                ...(phaseTimings === undefined
                  ? {}
                  : {
                      rewriteMs: phaseTimings.rewriteMs,
                      embedMs: phaseTimings.embedMs,
                      searchMs: phaseTimings.searchMs,
                      rerankMs: phaseTimings.rerankMs,
                      retrievalTotalMs: phaseTimings.totalMs,
                    }),
              },
              output: { hits: evidence.hits },
            });
          } catch {
            /* tracing must never break retrieval */
          }
        },
      };
    },

    startModelCall(name, input) {
      let span: Span<SpanType.MODEL_GENERATION> | undefined;
      try {
        span = rootSpan.createChildSpan({
          type: SpanType.MODEL_GENERATION,
          name,
          ...(input === undefined ? {} : { input }),
        });
      } catch {
        span = undefined;
      }

      if (!span || !span.isValid) {
        return NOOP_MODEL_CALL;
      }

      const modelSpan = span;
      return {
        end(output) {
          try {
            modelSpan.end({
              output: { questionCount: output.questionCount },
              attributes: {
                model: output.model,
                provider: "mistral",
                usage: {
                  inputTokens: output.usage.promptTokens,
                  outputTokens: output.usage.completionTokens,
                },
              },
              metadata: { questionCount: output.questionCount },
            });
          } catch {
            /* tracing must never break the answer path */
          }
        },
      };
    },

    link() {
      try {
        if (rootSpan.isValid) {
          return { traceId: rootSpan.traceId, parentSpanId: rootSpan.id };
        }
      } catch {
        /* fall through to empty link */
      }
      return {};
    },

    recordTtft(ms) {
      ttftMs = ms;
    },

    end(output) {
      if (settled) {
        return;
      }
      settled = true;
      try {
        rootSpan.end({
          output: { ...output, ttftMs: output.ttftMs ?? ttftMs ?? null },
          metadata: {
            found: output.found,
            needsClarification: output.needsClarification ?? false,
            refused: output.refused ?? false,
            citationCount: output.citationCount ?? 0,
            followUpCount: output.followUpCount ?? 0,
            ttftMs: output.ttftMs ?? ttftMs ?? null,
          },
        });
      } catch {
        /* ignore */
      }
    },

    fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      try {
        rootSpan.error({
          error: error instanceof Error ? error : new Error(String(error)),
          endSpan: true,
        });
      } catch {
        /* ignore */
      }
    },
  };
}
