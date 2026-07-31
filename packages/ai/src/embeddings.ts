import { env } from "@wunderstack/shared";
import { z } from "zod";

import { ensureHttpKeepAlive, fetchWithRetry, ProviderHttpError } from "./http.js";

/**
 * The single seam for embeddings, via Scaleway Generative APIs (EU, OpenAI-compatible).
 *
 * Returns the vectors together with the {model, dim, version} triple that the db layer
 * stores per chunk, so a re-embed is always detectable (see .cursor/rules/400-data-rag.mdc).
 * The definitive model + dimension are decided by the Fase 3 bake-off; this seam stays
 * model-agnostic until then.
 */

export interface EmbedInput {
  texts: string[];
  /** Scaleway model id, e.g. "bge-multilingual-gemma2" or "qwen3-embedding-8b". */
  model: string;
  /**
   * Requested output dimension. NOTE: Scaleway's Generative APIs currently return each model's
   * NATIVE maximum dimension only and do not support Matryoshka trimming (verified in the Fase 3
   * bake-off, see scripts/bake-off/results.md), so this is effectively a no-op on the current
   * models. It is kept for forward-compatibility; if it is passed and the provider ignores it,
   * `embed()` throws rather than silently returning a mismatched dimension.
   */
  dimensions?: number;
  /** Our own embedding-config version tag, stored per vector. */
  version?: string;
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  dim: number;
  version: string;
}

export const DEFAULT_EMBEDDING_VERSION = "1";

const SCALEWAY_EMBEDDINGS_URL = "https://api.scaleway.ai/v1/embeddings";

const embeddingResponseSchema = z.object({
  model: z.string(),
  data: z
    .array(
      z.object({
        index: z.number(),
        embedding: z.array(z.number()),
      }),
    )
    .min(1),
});

export async function embed(input: EmbedInput): Promise<EmbeddingResult> {
  ensureHttpKeepAlive();
  if (input.texts.length === 0) {
    throw new Error("embed() requires at least one text.");
  }
  if (!env.SCALEWAY_API_KEY) {
    throw new Error("SCALEWAY_API_KEY is not set (see .env.example).");
  }

  const response = await fetchWithRetry(
    SCALEWAY_EMBEDDINGS_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.SCALEWAY_API_KEY}`,
      },
      body: JSON.stringify({
        model: input.model,
        input: input.texts,
        ...(input.dimensions === undefined ? {} : { dimensions: input.dimensions }),
      }),
    },
    "Scaleway embeddings",
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new ProviderHttpError("Scaleway embeddings request", response.status, detail);
  }

  const payload: unknown = await response.json();
  const parsed = embeddingResponseSchema.parse(payload);

  // Preserve input order regardless of the order Scaleway returns.
  const ordered = [...parsed.data].sort((a, b) => a.index - b.index);
  const embeddings = ordered.map((entry) => entry.embedding);

  const [first] = embeddings;
  if (!first) {
    throw new Error("Scaleway returned no embeddings.");
  }

  // If a specific dimension was requested but the provider ignored it, fail loudly rather than
  // storing vectors of an unexpected dimension (which would silently break the pinned-dim invariant).
  if (input.dimensions !== undefined && first.length !== input.dimensions) {
    throw new Error(
      `Requested embedding dim ${String(input.dimensions)} but provider returned ` +
        `${String(first.length)} (model ${input.model}); Scaleway returns native dim only.`,
    );
  }

  return {
    embeddings,
    model: parsed.model,
    dim: first.length,
    version: input.version ?? DEFAULT_EMBEDDING_VERSION,
  };
}
