import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { EMBEDDING_CONFIG, GENERATION_CONFIG, env } from "@wunderstack/shared";
import { createSovereignModel } from "../model/sovereign-model.js";
import { buildLangfuseObservability } from "../observability/langfuse.js";
import { recordNumericTraceScore } from "../observability/feedback.js";
import { startCaoTrace, type CaoTrace } from "../observability/trace.js";
import {
  caoAnswerSchema,
  caoQuestionSchema,
  type CaoAgent,
  type CaoAnswer,
  type CaoAnswerOptions,
  type CaoCitation,
  type CaoQuestion,
  type CaoStreamEvent,
  type CaoUsage,
} from "../types.js";
import { buildVerifiedCitations } from "./build-citations.js";
import { detectClarification } from "./clarify.js";
import { condenseQuery, isElliptical } from "./condense.js";
import { generateAnswerWithRepair } from "./generate-answer.js";
import { hasUngroundedHardFact } from "./hard-facts.js";
import { parseGenerationOutput } from "./parse-generation.js";
import { CAO_SYSTEM_INSTRUCTIONS, NOT_FOUND_MESSAGE, buildAnswerPrompt } from "./prompt.js";
import { runRetrieval, type RetrievalOutput } from "./tools.js";
import { stripFailedMarkers, stripUnverifiedMarkers, verifyCitations } from "./verify-citations.js";

/**
 * The CAO-agent — one Mastra `Agent` (no Supervisor for a single agent; that pattern arrives with
 * the second agent). Mastra is fully contained here: callers only ever see the `CaoAgent` seam.
 *
 * Flow per question (deterministic, request/response):
 *   1. open a Langfuse trace and retrieve grounded context through @wunderstack/rag (scoped to a
 *      required fund) — the query-embedding + pgvector search are recorded as child spans;
 *   2. if nothing clears the relevance threshold, answer "niet gevonden" WITHOUT calling the LLM;
 *   3. otherwise let the Mastra agent generate a cited answer. The model attests each citation with
 *      a verbatim quote; we verify each quote against its chunk server-side, strip the ones that
 *      fail, and only surface verified, cited chunks as sources.
 */

const AGENT_KEY = "cao";
const ZERO_USAGE: CaoUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
const CITATION_SCORE_NAME = "citation-verification-rate";

async function retrieveTraced(
  trace: CaoTrace,
  args: {
    retrievalQuery: string;
    condensed: boolean;
    fund: string;
    topK: number;
    minScore: number;
  },
): Promise<RetrievalOutput> {
  const span = trace.startRetrieval({
    topK: args.topK,
    minScore: args.minScore,
    fund: args.fund,
    retrievalQuery: args.retrievalQuery,
    condensed: args.condensed,
  });
  try {
    const retrieval = await runRetrieval({
      query: args.retrievalQuery,
      fund: args.fund,
      topK: args.topK,
      minScore: args.minScore,
    });
    span.end({
      embeddingModel: EMBEDDING_CONFIG.model,
      embeddingDim: EMBEDDING_CONFIG.dim,
      hits: retrieval.hits,
      found: retrieval.hits.length > 0,
      timings: retrieval.timings,
    });
    return retrieval;
  } catch (error) {
    span.end({ embeddingModel: EMBEDDING_CONFIG.model, embeddingDim: EMBEDDING_CONFIG.dim, hits: [], found: false });
    throw error;
  }
}

/** Tracing options shared by generate/stream: attaches retrieval evidence to the Langfuse trace. */
function tracingOptionsFor(
  question: string,
  retrievalQuery: string,
  condensed: boolean,
  fund: string,
  topK: number,
  minScore: number,
  retrieval: RetrievalOutput,
) {
  return {
    metadata: {
      retrieval: {
        query: question,
        retrievalQuery,
        condensed,
        fund,
        topK,
        minScore,
        hits: retrieval.hits,
      },
    },
    tags: ["cao-agent", fund],
  };
}

/**
 * Turn raw model output + retrieval into verified citations and a cleaned answer.
 * Model citations whose quote is not verbatim in their chunk are stripped (O2 default), verified
 * against the FULL chunk content (not the truncated snippet).
 *
 * E13 runtime guard: an answer that asserts a hard fact — a money amount, percentage, or quantity
 * with a unit — which is NOT grounded in the retrieved context is an ungrounded numeric claim. That
 * is the "verzint een bedrag" failure (a pro-rata "€ 6,25" or an invented "312 uur" not in the CAO),
 * AND the "decorative citation" (etd-026): a figure — "16 weken" — dressed with a quote that verifies
 * verbatim but does not carry it. The guard grounds the FIGURE itself via `hasUngroundedHardFact`
 * (the same `findUngroundedFacts` decision the retry trigger and the eval's hard-hallucination scorer
 * use, so the three cannot drift): a citation is proof, not decoration. `userSupplied` (question +
 * history) is grounding, so echoing a number the user provided is not treated as a fabrication.
 * On a trip we refuse: the answer is replaced with the not-found message and the turn is marked
 * unfound. A grounded answer is unaffected — the number appears in the context.
 */
export function verifyAndBuild(
  raw: string,
  retrieval: RetrievalOutput,
  userSupplied: string,
): { answer: string; citations: CaoCitation[]; verificationFailed: boolean; hardFactGuardTriggered: boolean } {
  const parsed = parseGenerationOutput(raw);
  const fullContentById = new Map(retrieval.fullChunkContent);
  const verification = verifyCitations(parsed.modelCitations, fullContentById);
  const citations = buildVerifiedCitations(verification.verified, retrieval.chunks);
  const verifiedMarkers = citations.map((citation) => citation.ref);
  const answer = stripUnverifiedMarkers(
    stripFailedMarkers(parsed.answerMarkdown, verification.strippedMarkers),
    verifiedMarkers,
  );
  const verificationFailed = parsed.citationParseFailed || verification.strippedMarkers.length > 0;

  const grounding = [...fullContentById.values()].join(" ");
  if (hasUngroundedHardFact(answer, grounding, userSupplied)) {
    return { answer: NOT_FOUND_MESSAGE, citations: [], verificationFailed: true, hardFactGuardTriggered: true };
  }

  return { answer, citations, verificationFailed, hardFactGuardTriggered: false };
}

/**
 * G4 buffer-to-verify emit seam: turn an ALREADY-verified answer into the ordered stream events.
 *
 * This is the structural guarantee that the streaming path can never leak an ungrounded hard fact:
 * it accepts a settled `verifyAndBuild` result (guard already applied — `answer` is either the clean
 * verified prose or `NOT_FOUND_MESSAGE`), so a single `text` delta carries only safe text. There is
 * no token stream to retract. Streaming tokens as they arrive from the model would require abandoning
 * this seam — a deliberate change, not an accident. Locked by agent.test.ts.
 */
export function* settledAnswerEvents(
  result: { answer: string; citations: CaoCitation[]; verificationFailed: boolean; hardFactGuardTriggered: boolean; usage: CaoUsage },
  traceId: string | null,
): Generator<CaoStreamEvent> {
  const found = !result.hardFactGuardTriggered;
  if (result.answer.length > 0) {
    yield { type: "text", delta: result.answer };
  }
  yield {
    type: "citations",
    found,
    needsClarification: false,
    citations: result.citations,
    citationVerificationFailed: result.verificationFailed,
    answer: result.answer,
  };
  yield { type: "done", usage: result.usage, traceId };
}

/** The user's own numbers are premises, not fabrications: question + prior turns count as grounding. */
function userSuppliedText(input: CaoQuestion): string {
  const history = input.history ?? [];
  return [input.question, ...history.map((message) => message.content)].join(" ");
}

async function resolveRetrievalQuestion(input: CaoQuestion, signal?: AbortSignal): Promise<{
  answerQuestion: string;
  retrievalQuery: string;
  condensed: boolean;
}> {
  const history = input.history ?? [];
  if (!isElliptical(input.question, history)) {
    return { answerQuestion: input.question, retrievalQuery: input.question, condensed: false };
  }

  const condensedQuestion = await condenseQuery(history, input.question, signal);
  const retrievalQuery = condensedQuestion.length > 0 ? condensedQuestion : input.question;
  return { answerQuestion: retrievalQuery, retrievalQuery, condensed: true };
}

/** Fire-and-forget: record the citation verification outcome as a numeric Langfuse score. */
function recordCitationScore(traceId: string | null, verificationFailed: boolean): void {
  if (traceId === null) {
    return;
  }
  void recordNumericTraceScore({
    traceId,
    name: CITATION_SCORE_NAME,
    value: verificationFailed ? 0 : 1,
  }).catch(() => {
    /* best-effort */
  });
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

  /**
   * One place where a grounded, verified answer is produced — shared by both `answer()` and
   * `answerStream()` so the streamed path is not a weaker sibling. It runs the citation-contract
   * repair retry (generate-answer.ts) and then the serve-time verify/guard (verifyAndBuild).
   *
   * The repair turn is what recovers the common small-model slip where the prose carries the inline
   * [n] markers but the trailing citation JSON block is dropped: without it every marker is stripped
   * and the answer is served source-less (the "bronnen worden niet getoond" regression). Streaming
   * already buffers the whole answer before showing a character (BUFFER-TO-VERIFY, G5), so running the
   * repair here costs nothing user-visible and keeps stream/non-stream — and the eval — on one path.
   */
  async function generateVerifiedAnswer(args: {
    retrieval: RetrievalOutput;
    answerQuestion: string;
    userSupplied: string;
    tracingOptions: ReturnType<typeof tracingOptionsFor> & ReturnType<CaoTrace["link"]>;
    signal?: AbortSignal;
  }): Promise<{
    answer: string;
    citations: CaoCitation[];
    verificationFailed: boolean;
    hardFactGuardTriggered: boolean;
    usage: CaoUsage;
  }> {
    const generated = await generateAnswerWithRepair({
      chunkContentById: new Map(args.retrieval.fullChunkContent),
      userSupplied: args.userSupplied,
      generate: async (extraMessages) => {
        // Mastra's message union is the AI SDK discriminated CoreMessage type; our ChatMessage
        // (role is a union, content a string) is structurally a subset, so cast at this boundary.
        const messages = [
          { role: "user", content: buildAnswerPrompt(args.retrieval.context, args.answerQuestion) },
          ...extraMessages,
        ] as Parameters<typeof registered.generate>[0];
        const result = await registered.generate(messages, {
          modelSettings: {
            temperature: GENERATION_CONFIG.temperature,
            maxOutputTokens: GENERATION_CONFIG.maxTokens,
          },
          tracingOptions: args.tracingOptions,
          ...(args.signal === undefined ? {} : { abortSignal: args.signal }),
        });
        return {
          text: result.text,
          usage: {
            promptTokens: result.usage.inputTokens ?? 0,
            completionTokens: result.usage.outputTokens ?? 0,
            totalTokens: result.usage.totalTokens ?? 0,
          },
          finishReason: result.finishReason ?? null,
        };
      },
    });
    const built = verifyAndBuild(generated.text, args.retrieval, args.userSupplied);
    return { ...built, usage: generated.usage };
  }

  return {
    async answer(input: CaoQuestion, options: CaoAnswerOptions = {}): Promise<CaoAnswer> {
      const parsedInput = caoQuestionSchema.parse(input);
      const { question, fund, topK, minScore } = parsedInput;
      const userSupplied = userSuppliedText(parsedInput);

      const trace = startCaoTrace(mastra, {
        question,
        fund,
        topK,
        minScore,
        ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
        ...(options.userId === undefined ? {} : { userId: options.userId }),
        environment: env.NODE_ENV,
      });
      const traceId = trace.link().traceId ?? null;
      try {
        // Underspecified question: ask one targeted follow-up before spending retrieval/LLM tokens.
        const clarification = detectClarification(question);
        if (clarification !== null) {
          trace.end({ found: false, needsClarification: true, citationCount: 0 });
          return caoAnswerSchema.parse({
            answer: clarification,
            found: false,
            needsClarification: true,
            citations: [],
            traceId,
            usage: ZERO_USAGE,
          });
        }

        const query = await resolveRetrievalQuestion(parsedInput, options.signal);
        const retrieval = await retrieveTraced(trace, { fund, topK, minScore, ...query });

        if (retrieval.hits.length === 0) {
          trace.end({ found: false, refused: true, citationCount: 0 });
          return caoAnswerSchema.parse({
            answer: NOT_FOUND_MESSAGE,
            found: false,
            needsClarification: false,
            citations: [],
            traceId,
            usage: ZERO_USAGE,
          });
        }

        const tracingOptions = {
          ...tracingOptionsFor(question, query.retrievalQuery, query.condensed, fund, topK, minScore, retrieval),
          ...trace.link(),
        };
        // One citation-contract repair retry (generate-answer.ts): the same seam the eval uses to
        // collapse Gate C's generator variance. A first attempt that leaves an unverifiable quote, an
        // ungrounded number, or a dropped citation block is re-asked once; the cleaner attempt is kept.
        const { answer, citations, verificationFailed, hardFactGuardTriggered, usage } =
          await generateVerifiedAnswer({
            retrieval,
            answerQuestion: query.answerQuestion,
            userSupplied,
            tracingOptions,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          });
        recordCitationScore(traceId, verificationFailed);

        const found = !hardFactGuardTriggered;
        trace.end({ found, citationCount: citations.length, ...(hardFactGuardTriggered ? { refused: true } : {}) });
        return caoAnswerSchema.parse({
          answer,
          found,
          needsClarification: false,
          citations,
          traceId,
          usage,
          citationVerificationFailed: verificationFailed,
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
      const parsedInput = caoQuestionSchema.parse(input);
      const { question, fund, topK, minScore } = parsedInput;
      const userSupplied = userSuppliedText(parsedInput);
      const requestStart = performance.now();

      const trace = startCaoTrace(mastra, {
        question,
        fund,
        topK,
        minScore,
        ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
        ...(options.userId === undefined ? {} : { userId: options.userId }),
        environment: env.NODE_ENV,
      });
      const traceId = trace.link().traceId ?? null;
      try {
        const clarification = detectClarification(question);
        if (clarification !== null) {
          yield { type: "text", delta: clarification };
          yield {
            type: "citations",
            found: false,
            needsClarification: true,
            citations: [],
            citationVerificationFailed: false,
            answer: clarification,
          };
          yield { type: "done", usage: ZERO_USAGE, traceId };
          trace.end({ found: false, needsClarification: true, citationCount: 0 });
          return;
        }

        // Named progress so the UI can replace an undifferentiated spinner with phases.
        yield { type: "status", phase: "searching" };

        const query = await resolveRetrievalQuestion(parsedInput, options.signal);
        const retrieval = await retrieveTraced(trace, { fund, topK, minScore, ...query });

        if (retrieval.hits.length === 0) {
          yield { type: "text", delta: NOT_FOUND_MESSAGE };
          yield {
            type: "citations",
            found: false,
            needsClarification: false,
            citations: [],
            citationVerificationFailed: false,
            answer: NOT_FOUND_MESSAGE,
          };
          yield { type: "done", usage: ZERO_USAGE, traceId };
          trace.end({ found: false, refused: true, citationCount: 0 });
          return;
        }

        yield { type: "status", phase: "retrieved", count: retrieval.hits.length };
        yield { type: "status", phase: "generating" };

        const tracingOptions = {
          ...tracingOptionsFor(question, query.retrievalQuery, query.condensed, fund, topK, minScore, retrieval),
          ...trace.link(),
        };

        // BUFFER-TO-VERIFY (G5) + citation-contract repair: the hard-fact guard is all-or-nothing over
        // the WHOLE answer (a late ungrounded "16 weken" retroactively refuses everything before it),
        // and a dropped citation block strips every [n] marker — so we never stream prose token-by-token.
        // We generate the full answer (repairing a violated citation contract once, the SAME seam
        // `answer()` uses so the stream is not a weaker sibling), verify, guard-check, and only then emit
        // the settled prose. The client sees no partial stream, so there is nothing to retract.
        const result = await generateVerifiedAnswer({
          retrieval,
          answerQuestion: query.answerQuestion,
          userSupplied,
          tracingOptions,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        recordCitationScore(traceId, result.verificationFailed);

        // With full buffering the client sees its first character only once the answer is settled, so
        // that instant IS the user-perceived time-to-first-token.
        const ttftMs = performance.now() - requestStart;
        trace.recordTtft(ttftMs);

        // Emit the settled (verified, guard-checked) answer via the single buffer-to-verify seam. No
        // ungrounded hard fact can reach the client because `result.answer` is already the safe text.
        yield* settledAnswerEvents(result, traceId);
        trace.end({
          found: !result.hardFactGuardTriggered,
          citationCount: result.citations.length,
          ...(result.hardFactGuardTriggered ? { refused: true } : {}),
          ttftMs,
        });
      } catch (error) {
        trace.fail(error);
        throw error;
      } finally {
        // Safety net: if the consumer stops iterating early (e.g. client abort), close the trace.
        trace.end({ found: false });
      }
    },
  };
}
