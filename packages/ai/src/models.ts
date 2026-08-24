import { env } from "@wunderstack/shared";
import { z } from "zod";

import { ensureHttpKeepAlive, ProviderHttpError } from "./http.js";

/**
 * The single seam for LLM calls. Everything else in the codebase talks to this,
 * never to a provider directly (see .cursor/rules/500-agents.mdc).
 *
 * The default path is Mistral (FR/EU) and therefore sovereign by design. A routing
 * seam exists (a model registry + guard) but only EU-sovereign models are registered;
 * a non-EU model would have to be added explicitly with `sovereign: false` and is
 * rejected on the default path. Fund data never goes to a non-EU model by default.
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerateTextInput {
  messages: ChatMessage[];
  /** Defaults to the sovereign default model. */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Provider stop sequences. Generation ends at the first match and `finishReason` is `stop`,
   * not `length` — the difference between an answer that ended and one that ran out of budget.
   * Callers pass `GENERATION_CONFIG.stop` so eval and production stop at the same strings; see
   * that constant for why this exists (repository-continuation runaway, 2026-08-23).
   */
  stop?: readonly string[];
  /** Aborts the in-flight provider request (e.g. when the client disconnects). */
  abortSignal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerateTextResult {
  text: string;
  model: string;
  finishReason: string | null;
  usage: TokenUsage;
}

/** Input for streaming generation — same shape as {@link GenerateTextInput}. */
export type StreamTextInput = GenerateTextInput;

/** One streamed text fragment from the provider. */
export interface StreamTextDelta {
  type: "delta";
  delta: string;
}

/** Final event after all deltas; carries token usage for cost tracing. */
export interface StreamTextFinish {
  type: "finish";
  model: string;
  finishReason: string | null;
  usage: TokenUsage;
}

export type StreamTextPart = StreamTextDelta | StreamTextFinish;

/** List price of a model, in USD per 1M tokens. Drives cost tracing (see @wunderstack/agents). */
export interface ModelPricing {
  /** USD per 1M input (prompt) tokens. */
  inputPerMTok: number;
  /** USD per 1M output (completion) tokens. */
  outputPerMTok: number;
}

interface RegisteredModel {
  provider: "mistral";
  /** Whether the model runs on an EU-sovereign provider. */
  sovereign: boolean;
  /** Provider list price. Kept here so cost lives next to the model definition. */
  pricing: ModelPricing;
}

/**
 * Only EU-sovereign (Mistral) models are registered. This is the sovereignty guarantee.
 *
 * Prices are Mistral list prices (USD per 1M tokens), verified 3 Jul 2026. They are the
 * source of truth for cost tracing; batch usage is billed at 50% and is not modelled here.
 * Re-check against https://mistral.ai/pricing and re-sync Langfuse when they change.
 *
 * Both the floating `-latest` aliases and their pinned, date-stamped snapshots are registered
 * so reproducibility-sensitive callers (the eval suite) can pin a frozen checkpoint while the
 * production default may track `-latest`. Pins verified against Mistral's changelog 7 Jul 2026:
 *   mistral-large-latest -> mistral-large-2512 (Mistral Large 3)
 *   mistral-small-latest -> mistral-small-2603 (Mistral Small 4)
 */
const MODEL_REGISTRY: Record<string, RegisteredModel> = {
  "mistral-large-latest": {
    provider: "mistral",
    sovereign: true,
    pricing: { inputPerMTok: 0.5, outputPerMTok: 1.5 },
  },
  "mistral-large-2512": {
    provider: "mistral",
    sovereign: true,
    pricing: { inputPerMTok: 0.5, outputPerMTok: 1.5 },
  },
  "mistral-small-latest": {
    provider: "mistral",
    sovereign: true,
    pricing: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  },
  "mistral-small-2603": {
    provider: "mistral",
    sovereign: true,
    pricing: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  },
};

/**
 * Default LLM = Mistral Large 3 (pinned, EU-sovereign). Gate C validates answer quality on this model.
 * Raised from mistral-small-2603 after the A/B in golden-set.REVIEW.md §17: Small hit its ceiling on
 * hard reasoning + long verbatim citations (etd-021 answered with inverted logic; relevance 0.835 under
 * an independent judge), while Large answers correctly and copies long spans verbatim (relevance 0.97,
 * completeness 0.93). Both are Mistral/EU so the sovereign default path is unchanged (100-stack). Cost is
 * ~3.3×/2.5× input/output vs Small — negligible at demo volume; revisit if request volume grows.
 */
export const DEFAULT_LLM_MODEL = "mistral-large-2512";

/**
 * Hard upper bound on tokens the model may emit per call when the caller does not set its own
 * `maxTokens`. A CAO answer needs hundreds, not thousands, of tokens, so this caps runaway
 * generations that would amplify cost/latency (see security-audit finding #4, LLM10 Unbounded
 * Consumption). Callers can still pass a smaller `maxTokens`; they cannot silently opt out of a cap.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

/**
 * Hard ceiling on a single provider request. Node's `fetch` has NO default timeout, so a stalled
 * upstream (socket accepted but no bytes, or a half-open connection) would hang the caller forever.
 * In the chat route that hang is fatal: the NDJSON stream never closes, the composer stays disabled
 * ("stuck" chatbot), and the in-flight concurrency slot is never released — after a few of those,
 * every new question hits `server_busy`. The deadline is merged with the caller's abort signal, so a
 * genuine client disconnect still cancels earlier.
 *
 * Must stay >= the chat turn budget (`RUNTIME_CHAT_TURN_BUDGET_MS`, default 45s) so the turn budget
 * fires first and the route can emit a clean timeout `error` event. This per-call net is the
 * backstop for a single stalled provider fetch inside that budget.
 */
export const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Combine the caller's abort signal (client disconnect) with a hard request deadline. Always returns
 * a signal, so no provider request is ever unbounded. `AbortSignal.timeout` uses an unref'd timer, so
 * a fast-completing request does not keep the event loop alive waiting for the deadline.
 */
function requestSignal(caller?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return caller ? AbortSignal.any([caller, deadline]) : deadline;
}

const MISTRAL_CHAT_URL = "https://api.mistral.ai/v1/chat/completions";

const mistralUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

const mistralResponseSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: mistralUsageSchema,
});

/** One SSE chunk from Mistral's streaming chat completions endpoint. */
const mistralStreamChunkSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().optional(),
        delta: z
          .object({
            role: z.string().optional(),
            content: z.string().optional(),
          })
          .optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .default([]),
  usage: mistralUsageSchema.nullable().optional(),
});

/** A registered model paired with its list price. */
export interface ModelPriceEntry {
  model: string;
  pricing: ModelPricing;
}

/** All registered models with their list prices. Consumed by the Langfuse cost sync. */
export function listModelPricing(): ModelPriceEntry[] {
  return Object.entries(MODEL_REGISTRY).map(([model, info]) => ({
    model,
    pricing: info.pricing,
  }));
}

/** List price for a single registered model. Throws for unknown or non-sovereign models. */
export function getModelPricing(model: string): ModelPricing {
  return resolveModel(model).pricing;
}

function resolveModel(model: string): RegisteredModel {
  const info = MODEL_REGISTRY[model];
  if (!info) {
    throw new Error(
      `Unknown model "${model}". Register it in @wunderstack/ai before use (keep the default path sovereign).`,
    );
  }
  if (!info.sovereign) {
    throw new Error(
      `Model "${model}" is not EU-sovereign and may not be used on the default path.`,
    );
  }
  return info;
}

export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  ensureHttpKeepAlive();
  const model = input.model ?? DEFAULT_LLM_MODEL;
  resolveModel(model);

  if (!env.MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY is not set (see .env.example).");
  }

  const response = await fetch(MISTRAL_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify(buildMistralRequestBody(input, false)),
    signal: requestSignal(input.abortSignal),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ProviderHttpError("Mistral request", response.status, detail);
  }

  const payload: unknown = await response.json();
  const parsed = mistralResponseSchema.parse(payload);

  const [choice] = parsed.choices;
  if (!choice) {
    throw new Error("Mistral returned no choices.");
  }

  return {
    text: choice.message.content,
    model: parsed.model,
    finishReason: choice.finish_reason ?? null,
    usage: mapUsage(parsed.usage),
  };
}

function mapUsage(usage: z.infer<typeof mistralUsageSchema>): TokenUsage {
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

/**
 * Exported for unit testing (`models.test.ts`): the request body is the contract with the provider,
 * and a parameter that silently fails to be sent looks exactly like a model that ignores it.
 * @internal
 */
export function buildMistralRequestBody(input: GenerateTextInput, stream: boolean): Record<string, unknown> {
  const model = input.model ?? DEFAULT_LLM_MODEL;
  // An empty array is not a stop list; sending `stop: []` is a request the provider may reject.
  const stop = input.stop === undefined || input.stop.length === 0 ? undefined : [...input.stop];
  return {
    model,
    messages: input.messages,
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    max_tokens: input.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    ...(stop === undefined ? {} : { stop }),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
}

async function* parseMistralSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<z.infer<typeof mistralStreamChunkSchema>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let lineBreak = buffer.indexOf("\n");
      while (lineBreak !== -1) {
        const line = buffer.slice(0, lineBreak).trimEnd();
        buffer = buffer.slice(lineBreak + 1);
        lineBreak = buffer.indexOf("\n");

        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const payload = trimmed.slice("data:".length).trim();
        if (payload === "[DONE]") {
          return;
        }
        if (payload.length === 0) {
          continue;
        }

        let json: unknown;
        try {
          json = JSON.parse(payload);
        } catch {
          throw new Error(`Mistral stream returned invalid JSON: ${payload.slice(0, 120)}`);
        }
        yield mistralStreamChunkSchema.parse(json);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream Mistral chat completions token-by-token (EU-sovereign default path).
 * Yields `delta` parts for each text fragment and a final `finish` with usage.
 * Requires `stream_options.include_usage` so cost tracing receives token counts.
 */
export async function* streamText(input: StreamTextInput): AsyncGenerator<StreamTextPart> {
  ensureHttpKeepAlive();
  const model = input.model ?? DEFAULT_LLM_MODEL;
  resolveModel(model);

  if (!env.MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY is not set (see .env.example).");
  }

  const response = await fetch(MISTRAL_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(buildMistralRequestBody(input, true)),
    signal: requestSignal(input.abortSignal),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ProviderHttpError("Mistral stream request", response.status, detail);
  }

  if (!response.body) {
    throw new Error("Mistral stream response has no body.");
  }

  let resolvedModel = model;
  let finishReason: string | null = null;
  let usage: TokenUsage | undefined;

  for await (const chunk of parseMistralSseStream(response.body)) {
    if (chunk.model) {
      resolvedModel = chunk.model;
    }

    const [choice] = chunk.choices;
    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }
    const delta = choice?.delta?.content;
    if (delta) {
      yield { type: "delta", delta };
    }

    if (chunk.usage) {
      usage = mapUsage(chunk.usage);
    }
  }

  yield {
    type: "finish",
    model: resolvedModel,
    finishReason,
    usage: usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}
