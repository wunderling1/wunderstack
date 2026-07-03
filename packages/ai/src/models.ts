import { env } from "@wunderstack/shared";
import { z } from "zod";

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

interface RegisteredModel {
  provider: "mistral";
  /** Whether the model runs on an EU-sovereign provider. */
  sovereign: boolean;
}

/** Only EU-sovereign (Mistral) models are registered. This is the sovereignty guarantee. */
const MODEL_REGISTRY: Record<string, RegisteredModel> = {
  "mistral-large-latest": { provider: "mistral", sovereign: true },
  "mistral-small-latest": { provider: "mistral", sovereign: true },
};

/** Default LLM = Mistral (sovereign). */
export const DEFAULT_LLM_MODEL = "mistral-large-latest";

const MISTRAL_CHAT_URL = "https://api.mistral.ai/v1/chat/completions";

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
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

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
    body: JSON.stringify({
      model,
      messages: input.messages,
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.maxTokens === undefined ? {} : { max_tokens: input.maxTokens }),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Mistral request failed (${String(response.status)}): ${detail}`);
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
    usage: {
      promptTokens: parsed.usage.prompt_tokens,
      completionTokens: parsed.usage.completion_tokens,
      totalTokens: parsed.usage.total_tokens,
    },
  };
}
