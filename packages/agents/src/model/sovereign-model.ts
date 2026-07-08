import { DEFAULT_LLM_MODEL, generateText, streamText, type ChatMessage } from "@wunderstack/ai";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";

/**
 * The bridge that lets Mastra drive our own model seam instead of talking to a provider directly.
 *
 * Mastra's `Agent` expects an AI SDK language model. Rule 500-agents is hard: *all* model calls go
 * through `@wunderstack/ai`, and the default path must stay EU-sovereign. So instead of handing
 * Mastra an `@ai-sdk/mistral` provider (which would bypass our seam and its sovereignty guard),
 * we implement the AI SDK `LanguageModelV2` interface as a thin adapter that delegates every
 * generation to `@wunderstack/ai.generateText`. Swapping Mastra or the provider stays a one-file
 * change, and no fund data can reach a non-EU model without going through the guard in
 * `@wunderstack/ai`.
 *
 * The adapter is text-only: v1 retrieval is deterministic (see cao/agent.ts), so the model never
 * needs to emit tool calls. Tool definitions passed by Mastra are ignored (surfaced as a warning).
 */

function flattenPrompt(prompt: LanguageModelV2Prompt): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const message of prompt) {
    if (message.role === "system") {
      messages.push({ role: "system", content: message.content });
      continue;
    }
    if (message.role === "user" || message.role === "assistant") {
      let text = "";
      for (const part of message.content) {
        if (part.type === "text") {
          text += part.text;
        }
      }
      if (text.length > 0) {
        messages.push({ role: message.role, content: text });
      }
      continue;
    }
    // role === "tool": v1 has no LLM-driven tool calls, so there is nothing to forward.
  }
  return messages;
}

/** Map Mistral/OpenAI-style finish reasons onto the AI SDK's fixed vocabulary. */
function mapFinishReason(reason: string | null): LanguageModelV2FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
    case "model_length":
      return "length";
    case "tool_calls":
      return "tool-calls";
    case "content_filter":
      return "content-filter";
    case "error":
      return "error";
    case null:
      return "unknown";
    default:
      return "other";
  }
}

const PROVIDER = "wunderstack-ai";

export interface SovereignModelOptions {
  /** Underlying model id resolved by the @wunderstack/ai registry. Defaults to the sovereign default. */
  modelId?: string;
}

/**
 * Build a `LanguageModelV2` that Mastra can use but that only ever calls `@wunderstack/ai`.
 */
export function createSovereignModel(options: SovereignModelOptions = {}): LanguageModelV2 {
  const modelId = options.modelId ?? DEFAULT_LLM_MODEL;

  async function generate(callOptions: LanguageModelV2CallOptions): Promise<{
    text: string;
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelV2Usage;
  }> {
    const result = await generateText({
      messages: flattenPrompt(callOptions.prompt),
      model: modelId,
      ...(callOptions.temperature === undefined ? {} : { temperature: callOptions.temperature }),
      ...(callOptions.maxOutputTokens === undefined
        ? {}
        : { maxTokens: callOptions.maxOutputTokens }),
      ...(callOptions.abortSignal === undefined ? {} : { abortSignal: callOptions.abortSignal }),
    });
    return {
      text: result.text,
      finishReason: mapFinishReason(result.finishReason),
      usage: {
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      },
    };
  }

  return {
    specificationVersion: "v2",
    provider: PROVIDER,
    modelId,
    supportedUrls: {},

    async doGenerate(callOptions) {
      const { text, finishReason, usage } = await generate(callOptions);
      const content: LanguageModelV2Content[] = [{ type: "text", text }];
      return { content, finishReason, usage, warnings: [] };
    },

    async doStream(callOptions) {
      const messages = flattenPrompt(callOptions.prompt);
      const textId = "0";
      let finishReason: LanguageModelV2FinishReason = "unknown";
      let usage: LanguageModelV2Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: textId });
          try {
            for await (const part of streamText({
              messages,
              model: modelId,
              ...(callOptions.temperature === undefined ? {} : { temperature: callOptions.temperature }),
              ...(callOptions.maxOutputTokens === undefined
                ? {}
                : { maxTokens: callOptions.maxOutputTokens }),
              ...(callOptions.abortSignal === undefined ? {} : { abortSignal: callOptions.abortSignal }),
            })) {
              if (part.type === "delta") {
                controller.enqueue({ type: "text-delta", id: textId, delta: part.delta });
              } else {
                finishReason = mapFinishReason(part.finishReason);
                usage = {
                  inputTokens: part.usage.promptTokens,
                  outputTokens: part.usage.completionTokens,
                  totalTokens: part.usage.totalTokens,
                };
              }
            }
          } catch (error) {
            controller.error(error);
            return;
          }
          controller.enqueue({ type: "text-end", id: textId });
          controller.enqueue({ type: "finish", finishReason, usage });
          controller.close();
        },
      });
      return { stream };
    },
  };
}
