import { env } from "@wunderstack/shared";
import { z } from "zod";

/**
 * The single seam for reranking, via Scaleway Generative APIs (EU).
 *
 * Scaleway's `/v1/rerank` endpoint follows the Jina/Cohere rerank format (not OpenAI).
 * Only EU-sovereign models are registered; fund data never leaves the sovereign path.
 */

export interface RerankInput {
  /** The user query to rank documents against. */
  query: string;
  /** Document texts to rank (same order as the caller's chunk list). */
  documents: string[];
  /** How many top documents to return. Defaults to all, in ranked order. */
  topN?: number;
  /** Scaleway rerank model id. Defaults to the pinned RERANK_CONFIG model at the call site. */
  model?: string;
}

export interface RerankResultItem {
  /** Index into the input `documents` array. */
  index: number;
  /** Relevance score in [0,1] from the provider (higher = more relevant). */
  relevanceScore: number;
}

export interface RerankResult {
  model: string;
  results: RerankResultItem[];
}

interface RegisteredRerankModel {
  provider: "scaleway";
  /** Whether the model runs on an EU-sovereign provider. */
  sovereign: boolean;
}

/**
 * Only EU-sovereign rerank models are registered. This is the sovereignty guarantee.
 * `qwen3-embedding-8b` is the Scaleway serverless rerank model (verified Jul 2026).
 */
const RERANK_MODEL_REGISTRY: Record<string, RegisteredRerankModel> = {
  "qwen3-embedding-8b": { provider: "scaleway", sovereign: true },
};

const SCALEWAY_RERANK_URL = "https://api.scaleway.ai/v1/rerank";

const rerankResponseSchema = z.object({
  model: z.string(),
  results: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        relevance_score: z.number(),
        document: z
          .object({
            text: z.string().optional(),
          })
          .optional(),
      }),
    )
    .min(0),
});

function resolveRerankModel(model: string): RegisteredRerankModel {
  const info = RERANK_MODEL_REGISTRY[model];
  if (!info) {
    throw new Error(
      `Unknown rerank model "${model}". Register it in @wunderstack/ai before use (keep the default path sovereign).`,
    );
  }
  if (!info.sovereign) {
    throw new Error(
      `Rerank model "${model}" is not EU-sovereign and may not be used on the default path.`,
    );
  }
  return info;
}

export async function rerankDocuments(input: RerankInput): Promise<RerankResult> {
  if (input.documents.length === 0) {
    return { model: input.model ?? "none", results: [] };
  }

  const model = input.model ?? "qwen3-embedding-8b";
  resolveRerankModel(model);

  if (!env.SCALEWAY_API_KEY) {
    throw new Error("SCALEWAY_API_KEY is not set (see .env.example).");
  }

  const response = await fetch(SCALEWAY_RERANK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SCALEWAY_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      query: input.query,
      documents: input.documents,
      ...(input.topN === undefined ? {} : { top_n: input.topN }),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Scaleway rerank request failed (${String(response.status)}): ${detail}`);
  }

  const payload: unknown = await response.json();
  const parsed = rerankResponseSchema.parse(payload);

  return {
    model: parsed.model,
    results: parsed.results.map((entry) => ({
      index: entry.index,
      relevanceScore: entry.relevance_score,
    })),
  };
}
