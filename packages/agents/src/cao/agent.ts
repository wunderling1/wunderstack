import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { EMBEDDING_CONFIG } from "@wunderstack/shared";
import { createSovereignModel } from "../model/sovereign-model.js";
import { buildLangfuseObservability } from "../observability/langfuse.js";
import { startCaoTrace, type CaoTrace } from "../observability/trace.js";
import {
  caoAnswerSchema,
  caoQuestionSchema,
  type CaoAgent,
  type CaoAnswer,
  type CaoAnswerOptions,
  type CaoQuestion,
  type CaoStreamEvent,
  type CaoUsage,
} from "../types.js";
import { detectClarification } from "./clarify.js";
import { CAO_SYSTEM_INSTRUCTIONS, NOT_FOUND_MESSAGE, buildAnswerPrompt } from "./prompt.js";
import { runRetrieval, type RetrievalOutput } from "./tools.js";

/**
 * The CAO-agent — one Mastra `Agent` (no Supervisor for a single agent; that pattern arrives with
 * the second agent). Mastra is fully contained here: callers only ever see the `CaoAgent` seam.
 *
 * Flow per question (deterministic, request/response):
 *   1. open a Langfuse trace (via the local tracing seam) and retrieve grounded context through
 *      @wunderstack/rag — the query-embedding + pgvector search are recorded as child spans;
 *   2. if nothing clears the relevance threshold, answer "niet gevonden" WITHOUT calling the LLM —
 *      the anti-hallucination guard, and it saves tokens. The retrieval span is still emitted, so
 *      the refusal is traceable (no untraced retrieval/embedding call);
 *   3. otherwise let the Mastra agent generate a cited answer, with the model routed through
 *      @wunderstack/ai (sovereign) and the generation linked into the same trace.
 */

const AGENT_KEY = "cao";
const ZERO_USAGE: CaoUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/**
 * Run retrieval inside a traced span so the query-embedding + pgvector search are always visible in
 * Langfuse — even on the "niet gevonden" path where no LLM call follows (see code review W1/W2).
 * A tracing failure never breaks retrieval: the span is a no-op when observability is unconfigured.
 */
async function retrieveTraced(
  trace: CaoTrace,
  args: { question: string; fund: string | undefined; topK: number; minScore: number },
): Promise<RetrievalOutput> {
  const span = trace.startRetrieval({ topK: args.topK, minScore: args.minScore, fund: args.fund });
  try {
    const retrieval = await runRetrieval({
      query: args.question,
      topK: args.topK,
      minScore: args.minScore,
      ...(args.fund ? { fund: args.fund } : {}),
    });
    span.end({
      embeddingModel: EMBEDDING_CONFIG.model,
      embeddingDim: EMBEDDING_CONFIG.dim,
      hits: retrieval.hits,
      found: retrieval.hits.length > 0,
    });
    return retrieval;
  } catch (error) {
    span.end({ embeddingModel: EMBEDDING_CONFIG.model, embeddingDim: EMBEDDING_CONFIG.dim, hits: [], found: false });
    throw error;
  }
}

/** Tracing options shared by generate/stream: attaches retrieval evidence to the Langfuse trace. */
function tracingOptionsFor(question: string, fund: string | undefined, topK: number, minScore: number, retrieval: RetrievalOutput) {
  return {
    metadata: {
      retrieval: {
        query: question,
        fund: fund ?? null,
        topK,
        minScore,
        hits: retrieval.hits,
      },
    },
    tags: ["cao-agent", ...(fund ? [fund] : [])],
  };
}

export function createCaoAgent(): CaoAgent {
  const agent = new Agent({
    id: AGENT_KEY,
    name: AGENT_KEY,
    instructions: CAO_SYSTEM_INSTRUCTIONS,
    model: createSovereignModel(),
  });

  const observability = buildLangfuseObservability();
  const mastra = new Mastra({
    agents: { [AGENT_KEY]: agent },
    ...(observability === undefined ? {} : { observability }),
  });

  // Retrieve the registered agent so it carries the Mastra context (observability, logging, ...).
  const registered = mastra.getAgent(AGENT_KEY);

  return {
    async answer(input: CaoQuestion, options: CaoAnswerOptions = {}): Promise<CaoAnswer> {
      const { question, fund, topK, minScore } = caoQuestionSchema.parse(input);

      const trace = startCaoTrace(mastra, { question, fund, topK, minScore });
      try {
        // Underspecified question: ask one targeted follow-up before spending retrieval/LLM tokens.
        const clarification = detectClarification(question);
        if (clarification !== null) {
          trace.end({ found: false, needsClarification: true, citationCount: 0 });
          return caoAnswerSchema.parse({
            answer: clarification,
            found: false,
            needsClarification: true,
            sources: [],
            citations: [],
            usage: ZERO_USAGE,
          });
        }

        const retrieval = await retrieveTraced(trace, { question, fund, topK, minScore });

        if (retrieval.hits.length === 0) {
          trace.end({ found: false, refused: true, citationCount: 0 });
          return caoAnswerSchema.parse({
            answer: NOT_FOUND_MESSAGE,
            found: false,
            needsClarification: false,
            sources: [],
            citations: [],
            usage: ZERO_USAGE,
          });
        }

        const result = await registered.generate(buildAnswerPrompt(retrieval.context, question), {
          tracingOptions: { ...tracingOptionsFor(question, fund, topK, minScore, retrieval), ...trace.link() },
          ...(options.signal === undefined ? {} : { abortSignal: options.signal }),
        });

        trace.end({ found: true, citationCount: retrieval.citations.length });
        return caoAnswerSchema.parse({
          answer: result.text,
          found: true,
          needsClarification: false,
          sources: retrieval.sources,
          citations: retrieval.citations,
          usage: {
            promptTokens: result.usage.inputTokens ?? 0,
            completionTokens: result.usage.outputTokens ?? 0,
            totalTokens: result.usage.totalTokens ?? 0,
          },
        });
      } catch (error) {
        trace.fail(error);
        throw error;
      }
    },

    async *answerStream(
      input: CaoQuestion,
      options: CaoAnswerOptions = {},
    ): AsyncIterable<CaoStreamEvent> {
      const { question, fund, topK, minScore } = caoQuestionSchema.parse(input);

      const trace = startCaoTrace(mastra, { question, fund, topK, minScore });
      try {
        const clarification = detectClarification(question);
        if (clarification !== null) {
          yield { type: "sources", found: false, needsClarification: true, sources: [], citations: [] };
          yield { type: "text", delta: clarification };
          yield { type: "done", usage: ZERO_USAGE };
          trace.end({ found: false, needsClarification: true, citationCount: 0 });
          return;
        }

        const retrieval = await retrieveTraced(trace, { question, fund, topK, minScore });

        if (retrieval.hits.length === 0) {
          yield { type: "sources", found: false, needsClarification: false, sources: [], citations: [] };
          yield { type: "text", delta: NOT_FOUND_MESSAGE };
          yield { type: "done", usage: ZERO_USAGE };
          trace.end({ found: false, refused: true, citationCount: 0 });
          return;
        }

        yield {
          type: "sources",
          found: true,
          needsClarification: false,
          sources: retrieval.sources,
          citations: retrieval.citations,
        };

        const output = await registered.stream(buildAnswerPrompt(retrieval.context, question), {
          tracingOptions: { ...tracingOptionsFor(question, fund, topK, minScore, retrieval), ...trace.link() },
          ...(options.signal === undefined ? {} : { abortSignal: options.signal }),
        });

        // Use the reader loop (not for-await) so typing stays clean across the web ReadableStream.
        const reader = output.textStream.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (value) {
              yield { type: "text", delta: value };
            }
          }
        } finally {
          reader.releaseLock();
        }

        const full = await output.getFullOutput();
        yield {
          type: "done",
          usage: {
            promptTokens: full.usage.inputTokens ?? 0,
            completionTokens: full.usage.outputTokens ?? 0,
            totalTokens: full.usage.totalTokens ?? 0,
          },
        };
        trace.end({ found: true, citationCount: retrieval.citations.length });
      } catch (error) {
        trace.fail(error);
        throw error;
      } finally {
        // Safety net: if the consumer stops iterating early (e.g. client abort), close the trace.
        // end()/fail() are idempotent, so an already-settled trace is untouched.
        trace.end({ found: false });
      }
    },
  };
}
